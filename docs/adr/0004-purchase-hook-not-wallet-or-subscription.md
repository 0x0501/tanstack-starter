# Payments are purchase adapters + a paid hook, not a wallet or subscription product

## Status

Accepted — 2026-08-01. Amended — 2026-08-04 (hook runs inside the flip's transaction; webhook HTTP contract).

## Context

Clones often need hardened money *ingress* (signatures, body limits, idempotency, async crypto IPN) without committing every product to multi-bucket wallets or SaaS subscription semantics.

## Decision

1. Ship **three optional payment provider adapters**: Stripe, Creem, NowPayments.
2. Record a **Purchase** row for idempotency (provider, external id, amount, currency, user, status).
3. On confirmed payment, call a single **purchase-paid hook** exactly once. The Starter does not implement balances, entitlements, or plans.
   - **Amended 2026-08-04.** "At most once" was implemented by making the atomic `pending`→`paid` flip the hook's only gate, with the hook called after it. A hook that threw therefore left the row `paid`, the provider's retry short-circuited on `already_paid`, and the delivery was lost while the audit log recorded `purchase.paid`. The hook now receives the flip's transaction (`hook(tx, purchase)`) and runs **inside** it: a throw rolls the flip back, `markPurchasePaid` rethrows, the route answers 5xx, and the retry re-enters and delivers once.
   - Because it shares that transaction, the hook does **database work only**. External IO there holds a Postgres connection across the network (see ADR 0006's deadlock rule; Hyperdrive cannot multiplex a held connection) and couples the provider's retry window to its latency. Fulfillment that needs IO writes a row in the hook and does the IO afterwards.
4. **No** wallet buckets, recharge-as-product language, invite/referral rewards, or multi-rail SaaS subscription engine as platform features.
5. **Payment method toggles** (admin): each rail can be disabled at runtime; server refuses disabled rails.
6. NowPayments remains **async**: hosted invoice return page is never sole truth; signed IPN (or equivalent) confirms paid; underpaid stays pending until finished or expired per provider rules treated as platform behavior.
7. Fulfillment trusts the **Purchase row's** amount and user, never callback-only amounts.
8. **Webhook HTTP contract (amended 2026-08-04).** Each rail's route is a thin shell over a framework-agnostic `handleXWebhook(db, { rawBody, signature, secret })` that returns a result union and throws only on a genuine processing failure. The shell answers: **400** for a bad/missing signature or a signed body that is not JSON, with no effect; **200** for every mapped outcome, so the provider stops retrying a delivered notification; **5xx** when the handler throws, so the provider retries — that retry is what makes point 3 exactly-once. The body is capped by `webhookBodyLimitMiddleware` before anything reads or hashes it.
   - The 400 for signature failure is a Starter decision, not an extraction: it follows each provider's own documented convention. A signature failure means "this body is not one I accept", which is a 400, not an authentication challenge.

## Considered options

- Full SaaS subscription tables — every product disagrees; crypto renewals are awkward.
- Adapters with no UI/hook — too thin to validate idempotency lessons.

## Consequences

- Demo fulfillment may log or set a trivial flag; real products replace the hook body.
- Audit log includes purchase lifecycle events. The `purchase.paid` row is written **after** the transaction commits, never inside it: audit writes are best-effort and a logging failure must not roll back a delivered payment.
- A clone whose fulfillment cannot be expressed as database work has to split it — durable row inside the hook, IO outside. That constraint is the price of exactly-once and is deliberate.
- Tests for fulfillment run against the real Postgres container. The atomicity under test is the database's, so an in-memory double cannot fail the way the retry path needs to.
- Better Auth Stripe/Creem plugins may be mounted for webhook verification only where useful; subscription tables are not the product.
