import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");
/** Downloads, kept between runs (gitignored). */
export const CACHE = resolve(ROOT, ".cache");
/** CSVs for the admin import (gitignored). */
export const OUT = resolve(ROOT, "out");
