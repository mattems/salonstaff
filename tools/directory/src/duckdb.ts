/** Runs SQL with the `duckdb` command line tool (`brew install duckdb`). */
import { resolve } from "node:path";
import { CACHE } from "./paths";

/** Extensions are kept in the cache so the script leaves nothing in ~/.duckdb. */
const EXTENSIONS = resolve(CACHE, "duckdb-extensions");

export function requireDuckdb() {
  if (!Bun.which("duckdb")) {
    console.error(
      "This script needs DuckDB. Install it with `brew install duckdb` and run it again.",
    );
    process.exit(1);
  }
}

/** Runs the statements and returns the rows of the last one (as JSON). */
export async function duckdb<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const env: Record<string, string | undefined> = { ...process.env };
  // DuckDB's agent mode changes the output; turn it off.
  delete env.AI_AGENT;
  delete env.CLAUDECODE;
  const settings = [`SET extension_directories = [${quote(EXTENSIONS)}];`, ...proxySettings(env)];
  const proc = Bun.spawn(["duckdb", "-json", "-bail", "-c", `${settings.join("\n")}\n${sql}`], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`DuckDB failed:\n${err.trim() || out.trim()}`);
  }
  // `-json` prints one array per statement that returns rows (and sometimes a warning); keep
  // the last array.
  const lines = out.split("\n");
  const start = lines.findLastIndex((line) => line.startsWith("["));
  if (start < 0) return [];
  return JSON.parse(lines.slice(start).join("\n")) as T[];
}

export const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * DuckDB can't read a proxy address with a username and password in it
 * (http://user:pass@host:port), so pass the parts as settings instead.
 */
function proxySettings(env: Record<string, string | undefined>): string[] {
  const raw = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  if (!raw) return [];
  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) delete env[key];
  const url = new URL(raw);
  const settings = [`SET http_proxy = ${quote(url.host)};`];
  if (url.username) {
    settings.push(`SET http_proxy_username = ${quote(decodeURIComponent(url.username))};`);
  }
  if (url.password) {
    settings.push(`SET http_proxy_password = ${quote(decodeURIComponent(url.password))};`);
  }
  return settings;
}
