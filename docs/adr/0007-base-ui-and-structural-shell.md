# Headless Base UI with replaceable presentation

## Status

Accepted — 2026-08-01.
Amended — 2026-08-02 (composed controls).
Amended — 2026-10-09 (Headless architecture; replaces the structure-only visual policy).

## Context

The template needs working auth, account, and admin pages, while each derived product must be free to choose its visual identity. The old structure-only policy turned a plain default into a restriction: theme tokens, rich styling, and motion were treated as architectural drift.

Base UI already supplies unstyled, accessible interaction behavior. Separating that behavior from the supplied presentation gives clones both working flows and control over their design.

## Decision

1. **Headless is the design architecture**, defined in [`../../DESIGN.md`](../../DESIGN.md). It prescribes ownership, not a visual style. Minimalism is optional.
2. Compose **`@base-ui/react` directly** for composite controls. Keep its native props, refs, state attributes, `render`, portal, and animation lifecycle available. Ordinary buttons, links, and inputs may use native HTML. Delete pass-through styling wrappers rather than maintaining another control API.
3. Ship a **replaceable default presentation** so platform pages work out of the box. Theme values live in `src/styles/theme.css`, controls in `src/styles/ui.css`, and shell layouts in `src/styles/layout.css`. Component rules use CSS layers below Tailwind utilities; presentation classes are opt-in.
4. Color palettes, typography, radii, semantic tokens, branding, and layouts are allowed. Clones may edit or replace the default skin without changing platform behavior. Use one interaction implementation for a control; styling does not require adding a second one.
5. **Motion is allowed**: CSS transitions/keyframes and JavaScript animation libraries may drive page, control, theme, and decorative effects. Default popup transitions use Base UI's lifecycle attributes. Reduced-motion treatment is local to animated components; there is no global duration override.
6. Preserve keyboard access, focus visibility/restoration, readable contrast, SSR hydration safety, real localized links, signed OAuth query forwarding, and server authorization. Base UI state attributes must match the control (`data-active` for Tabs, `data-selected` for Select).
7. Theme behavior is reusable via `useTheme`; the supplied theme control is one presentation. Keep the flash-prevention script independent of its appearance.
8. Delete unused control modules and dependencies. Add packages when a real product capability needs them.

## Consequences

- Platform flows remain usable on a fresh clone.
- The default palette and shell are examples rather than a mandatory minimalist identity.
- New Base UI compositions are unstyled until a presentation class is applied.
- Products can replace styling and add motion without dismantling authentication or interaction behavior.
- Visual customization is not a violation of extraction fidelity; platform contracts remain the stable part.
