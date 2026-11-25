/**
 * The springboard: a small app linking to everything `bun dev` starts, with a
 * light showing whether each is running, plus the commands and accounts a
 * day's work needs, so nobody has to remember ports or look them up.
 * A development tool only; it is never deployed.
 */
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import { page } from "./page";
import { GROUPS, type Group, type Service } from "./services";

/** `up`: answered well. `unwell`: answered with an error. `down`: no answer. */
export type Status = "up" | "unwell" | "down";

const TIMEOUT_MS = 1500;

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost", timeout: TIMEOUT_MS });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export async function check(service: Service): Promise<Status | null> {
  if (!service.check) return null;
  if (typeof service.check !== "string") {
    return (await portOpen(service.check.port)) ? "up" : "down";
  }
  try {
    const res = await fetch(service.check, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
    await res.body?.cancel();
    return res.status < 400 ? "up" : "unwell";
  } catch {
    return "down";
  }
}

export function createSpringboard(groups: Group[] = GROUPS) {
  /** Keyed the way the page names its lights: group index, then service index. */
  async function statuses(): Promise<Record<string, Status>> {
    const found: Record<string, Status> = {};
    await Promise.all(
      groups.flatMap((group, g) =>
        group.services.map(async (service, s) => {
          const status = await check(service);
          if (status) found[`${g}.${s}`] = status;
        }),
      ),
    );
    return found;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? "/", "http://springboard").pathname;
    if (path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(page(groups));
    }
    if (path === "/status") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      return res.end(JSON.stringify(await statuses()));
    }
    res.statusCode = 404;
    res.end("Not found. The springboard is at /.");
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });
  return { server };
}
