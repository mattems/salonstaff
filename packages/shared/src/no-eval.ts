/**
 * Imported first by each browser app: zod parses without compiling code. Otherwise its first
 * object schema tries `new Function`, which a policy without 'unsafe-eval' blocks and reports in
 * the console, though zod carries on without it.
 */
import { config } from "zod";

config({ jitless: true });
