# D-12 Account security: email changes, connected accounts, sessions

**Status:** Accepted (2026-11-26)

**Decision.** Everyone (salon staff and job seekers) can, from their account page:

- **Change their email** (or add a first one, for an account made with a mobile number). A 6-digit code
  goes to the new address (10 minutes, 5 tries, as sign-in codes); entering it makes the change. The
  old address is emailed that it changed, with support's address. If the new address is another
  account's, no code is sent and the answer looks the same (nobody learns who has an account).
- **Connect or disconnect Google and Apple.** The provider's email needn't match the account's.
  Disconnecting is refused only if it would leave no way in (never, today: every account has an
  email or a mobile, and codes always work for those).
- **See where they're signed in** (device from the user agent, IP, last active) and sign out one
  device or every other device.

Each change is audited (`user.email_changed`, `auth.provider_connected`, `auth.provider_disconnected`,
`auth.signed_out_device`, `auth.signed_out_elsewhere`). Better Auth makes the email change, so its
audit row follows the change rather than sharing its transaction.

**Why not a code to the current address too** (as kaybee confirms both)? An account made with a
mobile has no current address, and a person who's lost access to their old inbox should still be
able to move. The notice to the old address and the audit log are the safety net. Revisit if
accounts get taken over this way: require a fresh sign-in (Better Auth's `freshAge`) or a code to the
current email or mobile first.

**Not included:** passwords, passkeys and two-factor (D-02: no passwords; codes already prove the
address or number), changing the mobile number (it's tied to the D-08 verified mobile).
