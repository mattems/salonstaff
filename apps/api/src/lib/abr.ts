import type { AbnCheck } from "@salonstaff/db";
import { isValidAbn } from "@salonstaff/shared";
import type { Env } from "../env";

interface AbrAnswer {
  AbnStatus?: string;
  EntityName?: string;
  BusinessName?: string[];
  Message?: string;
}

/**
 * `status` says only that the ABN is active. ABNs are public, so whether a salon is shown as
 * verified is decided from `names` by `salonAbnStatus` (packages/shared).
 *
 * Checks an ABN on the Australian Business Register (ABN Lookup's JSON service). Without
 * `ABR_GUID`, or when the register doesn't answer, a valid ABN stays `pending` for staff to check.
 */
export async function lookupAbn(env: Env, abn: string): Promise<AbnCheck> {
  if (!isValidAbn(abn)) return { status: "failed", entityName: null };
  if (!env.ABR_GUID) return { status: "pending", entityName: null };
  try {
    const url = new URL("https://abr.business.gov.au/json/AbnDetails.aspx");
    url.searchParams.set("abn", abn);
    url.searchParams.set("guid", env.ABR_GUID);
    url.searchParams.set("callback", "cb");
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: "pending", entityName: null };
    // JSONP: cb({...})
    const body = (await response.text())
      .trim()
      .replace(/^cb\(/, "")
      .replace(/\)\s*;?$/, "");
    const answer = JSON.parse(body) as AbrAnswer;
    if (answer.AbnStatus === "Active") {
      return {
        status: "verified",
        entityName: answer.BusinessName?.[0] || answer.EntityName || null,
        names: [answer.EntityName, ...(answer.BusinessName ?? [])].filter((name): name is string =>
          Boolean(name),
        ),
      };
    }
    // Cancelled, or not an ABN the register knows.
    if (answer.AbnStatus || /valid ABN/i.test(answer.Message ?? "")) {
      return { status: "failed", entityName: null };
    }
    // Anything else (a GUID the register doesn't recognise, say) is our problem, not theirs.
    console.error(JSON.stringify({ level: "warn", event: "abr_refused", message: answer.Message }));
    return { status: "pending", entityName: null };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "abr_unavailable",
        message: (error as Error).message,
      }),
    );
    return { status: "pending", entityName: null };
  }
}
