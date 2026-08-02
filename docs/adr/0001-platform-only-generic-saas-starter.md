# Platform-only generic SaaS starter

## Status

Accepted — 2026-08-01.  
Amended — 2026-08-02 (extraction fidelity).

## Context

This scaffold is meant to be a cloneable base for *new* products. If it ships a kitchen-sink product domain (wallets, marketplaces, internal tools), every clone must unlearn foreign semantics. The Starter must stay a platform shell.

Equally damaging: **reinventing** platform infrastructure that a mature production stack already solved (request pipeline, auth hardening, RLS, OAuth issuer). Greenfield “starter simplifications” reintroduce the same bugs under new names.

## Decision

1. The Starter ships **platform capabilities only**: identity, roles, Hyperdrive, mail, Turnstile, optional payment provider adapters, standard auth pages, user dashboard, and admin console. It does **not** ship product-domain features such as wallets, API gateways, marketplace providers, referral ledgers, or recharge/top-up as a product.

2. The repository is a **standalone template**. Clones do not share packages back into other products for “common auth” (that path reintroduces domain leakage).

3. **Extraction fidelity (2026-08-02):** Platform code is obtained by **stripping product domain from a mature reference platform pattern**, not by redesigning the platform layer from scratch. Allowed deltas: remove product domain; env-driven brand strings; locale set (`en`/`de`); standalone packaging; omit optional observability until adopted. Disallowed deltas: alternate design systems, alternate load-bearing pipeline semantics, or dropping wire/OAuth/i18n contracts to “keep the starter small.” Open docs and shippable comments never name the private reference product, its domains, or monorepo paths.

## Consequences

- Implementation is selective: harden platform patterns; leave product tables and pages to clones.
- Platform invariant changes are deliberate ADRs, not automatic backports of product features.
- Clones start clean; product domain is always additive.
- When platform behavior is wrong, maintainers **re-copy the proven pattern** (de-identified) rather than invent a third variant.
- See ADR 0010 (request pipeline) and the alignment spec for remediation of past inventiveness.
