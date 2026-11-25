# D-02 Sign-in methods

**Status:** Accepted (2026-11-25)

**Decision.** No passwords. People sign in, or sign up on first use, with Google, Apple, a 6-digit email code
or a 6-digit SMS code (Twilio). Better Auth plugins: `emailOTP`, `phoneNumber`, social providers, `bearer` for
the mobile app. Codes last 10 minutes, 5 attempts, hashed at rest. Sign-in endpoints are rate limited per IP.

**Why.** Matt asked for Google/Apple or a manual account by email or mobile code. Codes also prove the person
controls the address or number — the first layer of verification before the ID check (D-03).
