/**
 * Gives each Worker its local `.dev.vars` from the committed `.dev.vars.example` when it has
 * none, and adds to one it has any value the example has gained since. `.dev.vars` is ignored
 * by git, so a real value put there for a test is never committed; the example holds the
 * stand-in values a fresh clone runs on. Run by `bun run setup`, `bun dev` and CI. Safe to run
 * again: nothing already in a `.dev.vars` is changed.
 */
import { appendFileSync, copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const apps = resolve(root, "apps");
const names = (text: string) =>
  new Set(
    text
      .split("\n")
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name)),
  );
let changed = 0;
for (const app of readdirSync(apps)) {
  const example = resolve(apps, app, ".dev.vars.example");
  const target = resolve(apps, app, ".dev.vars");
  if (!existsSync(example)) continue;
  if (!existsSync(target)) {
    copyFileSync(example, target);
    console.log(`• Created apps/${app}/.dev.vars from its example`);
    changed++;
    continue;
  }
  // A value the example gained since: added, and nothing already there is touched.
  const have = names(readFileSync(target, "utf8"));
  const missing = readFileSync(example, "utf8")
    .split("\n")
    .filter((line) => {
      const name = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
      return name !== undefined && !have.has(name);
    });
  if (missing.length === 0) continue;
  const text = readFileSync(target, "utf8");
  appendFileSync(target, `${text.endsWith("\n") ? "" : "\n"}${missing.join("\n")}\n`);
  console.log(`• Added ${missing.length} new value(s) to apps/${app}/.dev.vars from its example`);
  changed++;
}
if (changed === 0 && process.argv.includes("--verbose"))
  console.log("• Every .dev.vars is in place");
