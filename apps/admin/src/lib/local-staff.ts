/**
 * Local development only. There is no Cloudflare Access on a laptop to say
 * who you are, so the portal asks, remembers the answer in this browser and
 * sends it with each request. A deployed API ignores the header entirely.
 */
const KEY = "local-staff";
export const LOCAL_STAFF_HEADER = "X-Local-Staff";

export function chosenLocalStaff(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function chooseLocalStaff(email: string | null) {
  try {
    if (email) window.localStorage.setItem(KEY, email);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked; the picker then asks again on the next load.
  }
}
