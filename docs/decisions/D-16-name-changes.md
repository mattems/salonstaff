# D-16 A new name after the ID check means verifying again

**Status:** Accepted (2026-11-27)

**Decision.** A job seeker can change their first or last name at any time. If their ID check has
passed, a real change (not just case, accents or punctuation: `nameChangeExpiresIdentity` in
`packages/shared/src/rules.ts`) expires that check in the same save: its status becomes `expired`, the
verified tick goes, and they verify their ID again. The expired check keeps its verification ID, outcome
and dates (D-03), and the audit log records `check.expired` with the reason `name_changed`. The website and
the app say so beside the name, and ask before saving.

**Why.** The ID check compares the name on the ID with the profile (`nameMatched`), and salons see the
verified tick next to that name. Without this, someone could pass with one name and then show another.
Locking the name instead would leave people who marry or correct a typo stuck waiting for support.

**Consequences.** `expired` is a new verification status: everything that asks "is it verified?" already
treats it as not verified, and starting a new ID check is allowed. It can later serve other reasons to
re-check (an ID that has itself expired).
