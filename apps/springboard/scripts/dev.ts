/**
 * Runs the springboard for `bun dev` and, once it answers, opens it in the
 * browser. The opening happens here, not in the server, because the server
 * restarts whenever its code changes and this does not: one `bun dev`, one tab.
 * `SPRINGBOARD_OPEN=0 bun dev` leaves the browser alone.
 */
import { spawn } from "node:child_process";

const url = `http://localhost:${process.env.PORT ?? "4100"}`;
const server = spawn("bun", ["--watch", "src/main.ts"], { stdio: "inherit" });

function openInBrowser() {
  const [command, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  // If there is nothing to open it with, the address is still in the output.
  spawn(command as string, args, { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}

async function openOnceUp() {
  for (let tries = 0; tries < 40; tries++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      return openInBrowser();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
if (process.env.SPRINGBOARD_OPEN !== "0" && !process.env.CI) void openOnceUp();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
