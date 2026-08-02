# Payments are purchase adapters + a paid hook, not a wallet or subscription product

## Status

Accepted — 2026-08-01.

## Context

Clones often need hardened money *ingress* (signatures, body limits, idempotency, async crypto IPN) without committing every product to multi-bucket wallets or SaaS subscription semantics.

## Decision

1. Ship **three optional payment provider adapters**: Stripe, Creem, NowPayments.
2. Record a **Purchase** row for idempotency (provider, external id, amount, currency, user, status).
3. On confirmed payment, call a single **purchase-paid hook** at most once. The Starter does not implement balances, entitlements, or plans.
4. **No** wallet buckets, recharge-as-product language, invite/referral rewards, or multi-rail SaaS subscription engine as platform features.
5. **Payment method toggles** (admin): each rail can be disabled at runtime; server refuses disabled rails.
6. NowPayments remains **async**: hosted invoice return page is never sole truth; signed IPN (or equivalent) confirms paid; underpaid stays pending until finished or expired per provider rules treated as platform behavior.
7. Fulfillment trusts the **Purchase row's** amount and user, never callback-only amounts.

## Considered options

- Full SaaS subscription tables — every product disagrees; crypto renewals are awkward.
- Adapters with no UI/hook — too thin to validate idempotency lessons.

## Consequences

- Demo fulfillment may log or set a trivial flag; real products replace the hook body.
- Audit log includes purchase lifecycle events.
- Better Auth Stripe/Creem plugins may be mounted for webhook verification only where useful; subscription tables are not the product.
