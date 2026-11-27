/**
 * Runs the mobile app on your own iPhone against your local API. Run it alongside `bun dev`
 * (which serves the API on :8890 and the site on :5300, on localhost only).
 *
 *   bun run phone       Expo Go: scan the QR code. Quick; no push notifications or Google.
 *   bun run ios:device  A development build installed on your plugged-in iPhone, signed with
 *                       Studio 372's Apple team (app.json), as `expo run:ios --device`.
 *
 * While it runs, it opens the API and the site to your Wi-Fi (on :8891 and :8892, forwarding to
 * localhost) and points the app at them. Ctrl-C closes all of it, and the API is back to
 * localhost only. Anyone on the same Wi-Fi can reach the local API meanwhile, including its dev
 * login: use it on a network you trust.
 */
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const mobile = resolve(root, "apps/mobile");
const device = process.argv.includes("--device");

/** The Mac's address on the local network (Wi-Fi first). */
function lanAddress(): string | undefined {
  const all = networkInterfaces();
  const order = ["en0", "en1", ...Object.keys(all)];
  for (const name of order) {
    const found = all[name]?.find((a) => a.family === "IPv4" && !a.internal);
    if (found) return found.address;
  }
  return undefined;
}

/** Headers a forwarded WebSocket keeps: who's connecting (the app's token, the site's cookie). */
const SOCKET_HEADERS = ["authorization", "cookie", "origin"];

interface Pipe {
  upstream: WebSocket;
  /** What the phone sent before localhost answered. */
  queue: (string | Buffer)[];
}

/** Paths never forwarded: the admin API and the local stand-ins for Stripe (`/api/…` on the site too). */
const CLOSED = /^(?:\/api)?\/(?:admin|v1\/dev)(?:\/|$)/;

/** A close code that can be sent on (1005 and 1006 only describe a close). */
const sendable = (code: number) => (code === 1000 || (code >= 3000 && code < 5000) ? code : 1000);

/**
 * Forwards everything on `port` (all interfaces) to localhost:`target`, WebSockets too (a live
 * conversation, D-18).
 */
function forward(port: number, target: number) {
  return Bun.serve<Pipe>({
    hostname: "0.0.0.0",
    port,
    async fetch(request, server) {
      const url = new URL(request.url);
      // The phone needs the app's API and the site, not the staff API or the local stand-ins for
      // Stripe: those stay on this Mac, whoever else is on the Wi-Fi.
      if (CLOSED.test(url.pathname))
        return new Response("Not available over the network", { status: 404 });
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const headers: Record<string, string> = {};
        for (const name of SOCKET_HEADERS) {
          const value = request.headers.get(name);
          if (value) headers[name] = value;
        }
        const upstream = new WebSocket(`ws://localhost:${target}${url.pathname}${url.search}`, {
          headers,
        } as never);
        if (server.upgrade(request, { data: { upstream, queue: [] } })) return undefined;
        upstream.close();
        return new Response("Expected a WebSocket", { status: 400 });
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      // Uncompressed, so the response can be passed straight back.
      headers.set("accept-encoding", "identity");
      const response = await fetch(`http://localhost:${target}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });
      const back = new Headers(response.headers);
      back.delete("content-encoding");
      back.delete("content-length");
      return new Response(response.body, { status: response.status, headers: back });
    },
    websocket: {
      open(phone) {
        const { upstream, queue } = phone.data;
        const flush = () => {
          for (const frame of queue.splice(0)) upstream.send(frame);
        };
        upstream.onopen = flush;
        upstream.onmessage = (event) => phone.send(event.data as string);
        upstream.onclose = (event) => phone.close(sendable(event.code), event.reason);
        if (upstream.readyState === WebSocket.OPEN) flush();
      },
      message(phone, frame) {
        const { upstream, queue } = phone.data;
        if (upstream.readyState === WebSocket.OPEN) upstream.send(frame);
        else queue.push(frame);
      },
      close(phone) {
        phone.data.upstream.close();
      },
    },
  });
}

async function isUp(port: number) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

const address = lanAddress();
if (!address) {
  console.error("✗ This Mac isn't on a network. Join the same Wi-Fi as your phone and try again.");
  process.exit(1);
}
for (const [port, what] of [
  [8890, "API"],
  [5300, "site"],
] as const) {
  if (!(await isUp(port))) {
    console.error(`✗ The ${what} isn't running on localhost:${port}. Start \`bun dev\` first.`);
    process.exit(1);
  }
}

const api = forward(8891, 8890);
const site = forward(8892, 5300);
const apiUrl = `http://${address}:${api.port}`;
const siteUrl = `http://${address}:${site.port}`;
console.log(`• API on your network: ${apiUrl}`);
console.log(`• Site on your network: ${siteUrl}`);
if (device) {
  console.log(
    "• Building the app for your iPhone. Plug it in (or pair it in Xcode) and unlock it;",
  );
  console.log("  the first time, turn on Developer Mode and trust the developer in Settings.");
} else {
  console.log("• Scan the QR code below with your iPhone's Camera (Expo Go must be installed).");
}
console.log("  Sign-in codes arrive in Mailpit on this Mac: http://localhost:8036\n");

const command = device
  ? ["npx", "expo", "run:ios", "--device"]
  : ["npx", "expo", "start", "--go", "--lan", "--clear"];
const expo = Bun.spawn(command, {
  cwd: mobile,
  env: {
    ...process.env,
    EXPO_PUBLIC_API_URL: apiUrl,
    EXPO_PUBLIC_SITE_URL: siteUrl,
    // CocoaPods needs a UTF-8 locale.
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
  },
  stdio: ["inherit", "inherit", "inherit"],
});

const stop = () => {
  expo.kill();
  api.stop(true);
  site.stop(true);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await expo.exited;
stop();
