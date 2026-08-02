# Base UI composed controls and a structural shell, no brand skin

## Status

Accepted — 2026-08-01.  
Amended — 2026-08-02 (composed wrappers; forbid second design system).

## Context

Each product will brand itself. Shipping a full product theme or a heavy design system in the template creates maintenance and delete-cost. Pure unstyled headless pages make it hard to validate auth/admin flows while developing the Starter.

A common failure mode is replacing brand skin with a **second** design language (shadcn-like semantic tokens, dual class banks, unused compound wrappers). That is still a design system to maintain, and it diverges from the composed Base UI patterns already proven on the platform.

## Decision

1. Interactive controls use **`@base-ui/react`** with **composed wrappers** (field, button, select, dialog, checkbox, tabs, menu, etc.) that match the mature platform’s control APIs after brand removal — not a parallel headless compound re-export style invented for the template.
2. Layout uses a **structural shell** only (stacks, grids, max-width, nav landmarks) via minimal utility CSS (Tailwind allowed for structure). Auth and app (dashboard/admin) shells are layout chrome, not a marketing skin.
3. **No** brand design system, no HeroUI/Radix/shadcn as Starter defaults, no decorative product skin, and **no substitute “neutral SaaS token system”** (semantic primary/muted/destructive productization) as Starter deliverables. Structural borders/focus rings are fine; a second theme vocabulary is not.
4. Base UI **state attributes must be correct** per control (e.g. tabs active vs select selected). Wrong data attributes are bugs, not styling nits.
5. Clones apply visual identity on top of Base UI wrappers and the shell.
6. Dead control modules and unused UI dependencies are deleted rather than left as aspirational API surface.

## Consequences

- Pages are functional and accessible but intentionally plain.
- Component wrappers stay free of brand identity; structure utilities may exist.
- Inventiveness that reintroduces a design system is non-compliant; fix by re-extracting composed controls, not by growing `styles` class catalogs.
- Theme FOUC script (light/dark class on `html`) may exist without becoming a brand widget.
