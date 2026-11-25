# D-05 Pricing and the launch free period

**Status:** Accepted (2026-11-25)

**Decision.** Every new or claimed salon lists jobs free for 90 days. The first 200 salons are founding salons and
keep the Salon Plan at $69/month (normally $99) for life. After the free period a job needs a $49 single listing
credit (30 days) or an active Salon Plan (unlimited). Staff can give credits, extend or end a free period, and
switch founding pricing on or off. Values live in `PRICING` (`packages/shared/src/constants.ts`).

**Why.** Traction first (free), then $50-per-listing revenue with a subscription to smooth hiring seasonality.
