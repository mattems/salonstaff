const base =
  process.env.DATABASE_URL ?? "postgres://salonstaff:salonstaff@localhost:54349/salonstaff";

/** The server the tests use, and the throwaway database they create on it. */
export const ADMIN_DATABASE_URL = base;
export const TEST_DATABASE_NAME = "salonstaff_test";
export const TEST_DATABASE_URL = (() => {
  const url = new URL(base);
  url.pathname = `/${TEST_DATABASE_NAME}`;
  return url.toString();
})();
