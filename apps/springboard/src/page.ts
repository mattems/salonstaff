/**
 * The page: a sidebar of pages, drawn once on the server, switched on the
 * client by the address's hash. Everything is in the HTML from the start, so
 * search can look at every page at once.
 */
import { ACCOUNTS, COMMANDS } from "./content";
import type { Group, Service } from "./services";

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

/** `localhost:5173/docs` from `http://localhost:5173/docs`. */
const shortAddress = (url: string) => url.replace(/^https?:\/\//, "");

/** `api-and-pipeline` from `API and pipeline`: the hash a group's page lives at. */
export const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Pages open in a new tab. Anything else is handed to another app, which needs no tab. */
const linkAttrs = (url: string) =>
  `href="${escapeHtml(url)}"${/^https?:/.test(url) ? ' target="_blank" rel="noreferrer"' : ""}`;

/** A tool that opens inside the springboard: at `#tools/mailpit`, in a frame. */
const framed = (group: Group, service: Service) =>
  Boolean(group.pane) && /^https?:/.test(service.url) && !service.ownTab;
const paneHash = (group: Group, service: Service) => `${slug(group.title)}/${slug(service.name)}`;

const lightFor = (service: Service, id: string) =>
  service.check
    ? `<span class="light" data-check="${id}" title="Checking…"></span>`
    : '<span class="light" style="visibility: hidden"></span>';

function serviceRow(group: Group, service: Service, id: string) {
  const light = lightFor(service, id);
  const link = framed(group, service)
    ? `href="#${paneHash(group, service)}"`
    : linkAttrs(service.url);
  return `<li class="row-wrap" data-search="${escapeHtml(`${service.name} ${service.what} ${service.address ?? service.url}`)}">
    <a class="row" ${link}>
      ${light}
      <span class="name">${escapeHtml(service.name)}${service.docker ? ' <span class="tag">Docker</span>' : ""}</span>
      <span class="what">${escapeHtml(service.what)}</span>
      <code>${escapeHtml(service.address ?? shortAddress(service.url))}</code>
    </a></li>`;
}

function serviceList(group: Group, g: number) {
  return `<ul>${group.services.map((service, s) => serviceRow(group, service, `${g}.${s}`)).join("")}</ul>`;
}

/** The sidebar's entries under a `pane` group: one per tool, with its light. */
function subNav(group: Group, g: number) {
  if (!group.pane) return "";
  const items = group.services.map((service, s) => {
    const link = framed(group, service)
      ? `href="#${paneHash(group, service)}" data-page="${paneHash(group, service)}"`
      : linkAttrs(service.url);
    const out = framed(group, service)
      ? `<a class="out" ${linkAttrs(service.url)} title="Open in a new tab">↗</a>`
      : "";
    return `<div class="subrow"><a class="sub" ${link}>${lightFor(service, `${g}.${s}`)}${escapeHtml(service.name)}</a>${out}</div>`;
  });
  return `<div class="subnav">${items.join("")}</div>`;
}

/** A tool's page: the tool itself, framed, filling the pane. The frame loads when first shown. */
function panePages(group: Group) {
  return group.services
    .filter((service) => framed(group, service))
    .map(
      (service) => `<section class="pane" data-page="${paneHash(group, service)}" hidden>
      <iframe data-src="${escapeHtml(service.url)}" title="${escapeHtml(service.name)}"></iframe>
    </section>`,
    )
    .join("");
}

function commandsPage() {
  return COMMANDS.map(
    (group) => `<h2>${escapeHtml(group.title)}</h2><ul>${group.commands
      .map(
        (c) => `<li class="row-wrap" data-search="${escapeHtml(`${c.command} ${c.what}`)}">
      <div class="row command">
        <code class="cmd">${escapeHtml(c.command)}</code>
        <span class="what">${escapeHtml(c.what)}</span>
        <button type="button" class="copy" data-copy="${escapeHtml(c.command)}" title="Copy">Copy</button>
      </div></li>`,
      )
      .join("")}</ul>`,
  ).join("");
}

function accountsPage() {
  return ACCOUNTS.map(
    (group) => `<h2>${escapeHtml(group.title)}</h2>${group.note ? `<p class="note">${escapeHtml(group.note)}</p>` : ""}<ul>${group.accounts
      .map((a) => {
        const inner = `<span class="name">${escapeHtml(a.name)}</span>
        <span class="what">${escapeHtml(a.how)}</span>
        <span class="who"><code>${escapeHtml(a.detail)}</code>${a.password ? ` <span class="tag">password <code>${escapeHtml(a.password)}</code></span>` : ""}</span>`;
        const row = a.url
          ? `<a class="row account" ${linkAttrs(a.url)}>${inner}</a>`
          : `<div class="row account">${inner}</div>`;
        return `<li class="row-wrap" data-search="${escapeHtml(`${a.name} ${a.detail} ${a.how}`)}">${row}</li>`;
      })
      .join("")}</ul>`,
  ).join("");
}

export function page(groups: Group[]): string {
  const nav: { hash: string; title: string; group?: number }[] = [
    { hash: "overview", title: "Overview" },
    ...groups.map((group, g) => ({ hash: slug(group.title), title: group.title, group: g })),
    { hash: "commands", title: "Commands" },
    { hash: "accounts", title: "Accounts" },
  ];
  const navItems = nav
    .map(
      (item) =>
        `<a href="#${item.hash}" data-page="${item.hash}"${item.group === undefined ? "" : ` data-group="${item.group}"`}>${escapeHtml(item.title)}<span class="count"></span></a>${
          item.group === undefined ? "" : subNav(groups[item.group] as Group, item.group)
        }`,
    )
    .join("");

  // No headings: the sidebar names the groups. A gap keeps the lists apart.
  const overview = groups.map((group, g) => serviceList(group, g)).join("");
  const groupPages = groups
    .map(
      (group, g) =>
        `<section data-page="${slug(group.title)}" hidden>${serviceList(group, g)}</section>${panePages(group)}`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Springboard</title>
<style>
  :root { color-scheme: light dark; --line: color-mix(in srgb, currentColor 15%, transparent);
    --faint: color-mix(in srgb, currentColor 6%, transparent); }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
  aside { border-right: 1px solid var(--line); padding: 20px 12px; position: sticky; top: 0; height: 100vh; overflow: auto;
    display: flex; flex-direction: column; gap: 12px; }
  aside .brand { font-weight: 700; font-size: 17px; padding: 0 8px; }
  aside .health { color: GrayText; font-size: 13px; padding: 0 8px; }
  aside input { width: 100%; font: inherit; font-size: 14px; padding: 6px 10px; border: 1px solid var(--line);
    border-radius: 8px; background: transparent; color: inherit; }
  aside input:focus { outline: 2px solid color-mix(in srgb, currentColor 30%, transparent); outline-offset: -1px; }
  nav { display: flex; flex-direction: column; gap: 2px; }
  nav a { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 8px;
    color: inherit; text-decoration: none; font-weight: 500; }
  nav a:hover { background: var(--faint); }
  nav a[aria-current] { background: color-mix(in srgb, currentColor 10%, transparent); }
  nav .count { font-size: 12px; color: GrayText; font-variant-numeric: tabular-nums; }
  nav .count.down { color: #dc2626; font-weight: 600; }
  .subnav { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 6px; }
  .subrow { display: flex; align-items: center; }
  .subnav a.sub { flex: 1; justify-content: flex-start; gap: 8px; padding: 4px 8px 4px 18px; font-weight: 400; font-size: 14px; }
  .subnav a.out { padding: 4px 8px; color: GrayText; font-size: 13px; visibility: hidden; }
  .subrow:hover a.out, .subrow:focus-within a.out { visibility: visible; }
  .subnav .light { width: 7px; height: 7px; flex: none; }
  main:has(> .pane:not([hidden])) { padding: 0; max-width: none; display: flex; flex-direction: column; height: 100vh; }
  .pane { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .pane iframe { flex: 1; width: 100%; border: 0; background: Canvas; }
  aside .hint { margin-top: auto; color: GrayText; font-size: 12px; padding: 0 8px; }
  kbd { font: 11px/1 ui-monospace, monospace; border: 1px solid var(--line); border-radius: 4px; padding: 2px 4px; }
  main { padding: 28px 32px; max-width: 900px; width: 100%; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: GrayText; margin: 24px 0 6px; }
  h2:first-child { margin-top: 0; }
  p { margin: 0 0 16px; color: GrayText; } .note { font-size: 14px; margin: -2px 0 8px; }
  ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  ul + ul { margin-top: 16px; }
  li + li { border-top: 1px solid var(--line); }
  .row { display: grid; grid-template-columns: 10px 190px 1fr auto; gap: 12px; align-items: center;
    padding: 10px 14px; color: inherit; text-decoration: none; }
  a.row:hover, a.row:focus-visible { background: var(--faint); outline: none; }
  .row.command { grid-template-columns: minmax(0, 1fr) auto; }
  .row.command .what { grid-column: 1; }
  .row.command .copy { grid-column: 2; grid-row: 1 / span 2; }
  .row.account { grid-template-columns: 190px 1fr; }
  .row.account .who { grid-column: 1 / -1; font-size: 13px; }
  .name { font-weight: 600; }
  .tag { font-size: 11px; font-weight: 500; color: GrayText; border: 1px solid var(--line); border-radius: 6px;
    padding: 1px 6px; margin-left: 4px; vertical-align: 1px; }
  .what { color: GrayText; }
  code { font-size: 13px; color: GrayText; }
  code.cmd { color: inherit; font-size: 13px; word-break: break-all; }
  .copy { font: inherit; font-size: 12px; padding: 3px 9px; border: 1px solid var(--line); border-radius: 6px;
    background: transparent; color: inherit; cursor: pointer; }
  .copy:hover { background: var(--faint); } .copy.done { color: #16a34a; border-color: #16a34a; }
  .light { width: 10px; height: 10px; border-radius: 50%; background: color-mix(in srgb, currentColor 25%, transparent); }
  .light.up { background: #16a34a; } .light.unwell { background: #d97706; } .light.down { background: #dc2626; }
  .empty { color: GrayText; padding: 24px 0; }
  [hidden] { display: none !important; }
  @media (max-width: 700px) {
    body { grid-template-columns: 1fr; }
    aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
    nav { flex-direction: row; flex-wrap: wrap; } nav .count { margin-left: 6px; }
    aside .hint { display: none; }
    main { padding: 20px 16px; }
    .subnav { flex-direction: row; flex-wrap: wrap; width: 100%; } .subnav a { padding-left: 8px; }
    main:has(> .pane:not([hidden])) { height: auto; } .pane iframe { height: 80vh; }
    .row { grid-template-columns: 10px 1fr auto; } .row .what { grid-column: 2 / -1; grid-row: 2; }
    .row.command { grid-template-columns: 1fr auto; } .row.command .what { grid-column: 1; }
    .row.account { grid-template-columns: 1fr; } .row.account .what { grid-column: 1; }
  }
</style>
<aside>
  <div class="brand">Springboard</div>
  <div class="health" id="health">Checking…</div>
  <input type="search" id="search" placeholder="Search" aria-label="Search" autocomplete="off">
  <nav id="nav">${navItems}</nav>
  <div class="hint"><kbd>/</kbd> search · <kbd>Esc</kbd> clear</div>
</aside>
<main>
  <section data-page="overview">${overview}</section>
  ${groupPages}
  <section data-page="commands" hidden>${commandsPage()}</section>
  <section data-page="accounts" hidden>${accountsPage()}</section>
  <section data-page="search" hidden><div id="results"></div><p class="empty" id="no-results" hidden>Nothing matches.</p></section>
</main>
<script>
  const LABELS = { up: "Running", unwell: "Answering, but with an error", down: "Not answering" };
  const pages = [...document.querySelectorAll("main > section")];
  const search = document.getElementById("search");
  const results = document.getElementById("results");

  function show(hash) {
    const name = pages.some((p) => p.dataset.page === hash) ? hash : "overview";
    for (const p of pages) p.hidden = p.dataset.page !== name;
    // A tool loads the first time it is shown, and stays loaded: switching away and back keeps its state.
    const frame = document.querySelector('[data-page="' + name + '"] iframe[data-src]');
    if (frame && !frame.src) frame.src = frame.dataset.src;
    for (const a of document.querySelectorAll("#nav a")) {
      if (a.dataset.page === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    document.title = name === "overview" ? "Springboard" : a11yTitle(name) + " · Springboard";
  }
  const a11yTitle = (name) => document.querySelector('#nav a[data-page="' + name + '"]')?.textContent ?? name;

  // Search draws matching rows from every page into one list, grouped by the page they came from.
  function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (!q) { show(location.hash.slice(1)); return; }
    results.replaceChildren();
    let found = 0;
    for (const p of pages) {
      if (p.dataset.page === "overview" || p.dataset.page === "search") continue;
      const rows = [...p.querySelectorAll("[data-search]")].filter((r) => r.dataset.search.toLowerCase().includes(q));
      if (!rows.length) continue;
      found += rows.length;
      const h = document.createElement("h2"); h.textContent = a11yTitle(p.dataset.page);
      const ul = document.createElement("ul");
      for (const r of rows) ul.append(r.cloneNode(true));
      results.append(h, ul);
    }
    document.getElementById("no-results").hidden = found > 0;
    for (const p of pages) p.hidden = p.dataset.page !== "search";
    for (const a of document.querySelectorAll("#nav a")) a.removeAttribute("aria-current");
    paint(lastStatuses);
  }

  let lastStatuses = {};
  function paint(statuses) {
    lastStatuses = statuses;
    for (const light of document.querySelectorAll("[data-check]")) {
      const status = statuses[light.dataset.check] ?? "down";
      light.className = "light " + status;
      light.title = LABELS[status];
      light.setAttribute("aria-label", LABELS[status]);
    }
    let up = 0, all = 0;
    const perGroup = {};
    for (const [id, status] of Object.entries(statuses)) {
      const g = id.split(".")[0];
      perGroup[g] ??= { up: 0, all: 0 };
      perGroup[g].all++; all++;
      if (status === "up") { perGroup[g].up++; up++; }
    }
    document.getElementById("health").textContent = all ? up + " of " + all + " running" : "Nothing to check";
    for (const a of document.querySelectorAll("#nav a[data-group]")) {
      const c = perGroup[a.dataset.group];
      const count = a.querySelector(".count");
      if (!c) { count.textContent = ""; continue; }
      count.textContent = c.up + "/" + c.all;
      count.classList.toggle("down", c.up < c.all);
    }
  }
  async function refresh() {
    let statuses = {};
    try { statuses = await (await fetch("/status")).json(); } catch {}
    paint(statuses);
  }

  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-copy]");
    if (!button) return;
    e.preventDefault();
    try { await navigator.clipboard.writeText(button.dataset.copy); } catch { return; }
    button.textContent = "Copied"; button.classList.add("done");
    setTimeout(() => { button.textContent = "Copy"; button.classList.remove("done"); }, 1200);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== search && !e.metaKey && !e.ctrlKey) { e.preventDefault(); search.focus(); search.select(); }
    if (e.key === "Escape" && search.value) { search.value = ""; runSearch(); search.blur(); }
  });
  search.addEventListener("input", runSearch);
  window.addEventListener("hashchange", () => { search.value = ""; show(location.hash.slice(1)); });

  show(location.hash.slice(1));
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
</script>
</html>`;
}
