/**
 * Web fallback used only when previewing the app in a browser during development
 * (expo-secure-store has no web implementation).
 */
export const tokenStore = {
  get: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  set: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  remove: async (key: string) => globalThis.localStorage?.removeItem(key),
};
