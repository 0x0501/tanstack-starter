# Headless design

The Starter separates platform behavior from presentation. **Headless is an architecture, not a visual style.** Minimalism, expressive branding, dense dashboards, gradients, illustrations, and rich motion are all valid product choices.

## Ownership

| Layer | Owns | Customize here |
|---|---|---|
| Platform | Authentication, permissions, RLS, OAuth, locale routing, server functions | `src/services/`, `src/server/`, middleware |
| Interaction | Focus, keyboard navigation, selection, popup lifecycle, ARIA | Compose `@base-ui/react` parts directly |
| Theme behavior | Stored light/dark/system preference and system changes | `src/hooks/use-theme.ts`; render your own control |
| Theme values | Colors, typography, radii, light/dark palettes | `src/styles/theme.css` |
| Presentation | Controls, states, optional motion | `src/styles/ui.css` |
| Layout | Auth, dashboard, admin, page widths | `src/styles/layout.css`, `src/components/shells.tsx` |

The supplied pages are working examples. Their default appearance is replaceable. New Base UI controls have no Starter styles until a presentation class is explicitly applied. Use native HTML for ordinary buttons, links, and inputs; use Base UI for composite interactions. Do not add pass-through wrappers or a second interaction library to restyle an existing control.

## Apply a visual identity

Edit the light and dark variables in `theme.css` to change the whole example UI. Semantic names such as `primary`, `muted`, and `destructive` describe presentation roles; they do not prescribe a palette. Include your font assets and change `--font-sans-stack` for typography.

For deeper changes, edit or replace `ui.css` and `layout.css` at their imports in `src/styles.css`. Their rules live in `@layer components`, below Tailwind utilities, so per-page utility classes override the supplied appearance without class-merging tricks. Shared class names in `src/components/ui/styles.ts` are presentation hooks, not component behavior.

For example, this changes an action's radius and padding:

```tsx
<button className={`${buttonPrimaryClass} rounded-full px-6`} type="submit">
	Save
</button>
```

Shells accept ordinary div props and `className`. Change a shell layout or replace it while retaining the page's platform flow. `useTheme()` returns `preference`, `setTheme`, and `mounted` for a custom theme control; the initial preference is `system` on both server and client, and stored preference is read after hydration. Keep the head initialization script for flash-free theme application.

## Motion

Animations are allowed throughout the app: page transitions, enter/exit effects, hover feedback, theme controls, and decorative sequences. Use CSS transitions/keyframes or add Motion/GSAP when the product needs them. No animation library is required by the Starter.

- Base UI popups expose `data-starting-style` and `data-ending-style` and positioning variables such as `--transform-origin`. The default menu/select transitions demonstrate this lifecycle.
- Base UI's native `render`, controlled state, portal, and actions APIs remain available for JavaScript animation. Follow the installed component's lifecycle for exit animations so focus restoration and unmounting still complete.
- Provide a reduced-motion treatment per animated component using `prefers-reduced-motion`, Tailwind `motion-safe`/`motion-reduce`, or the animation library's equivalent. The Starter does not globally force every animation to a near-zero duration.
- Keep initial rendering deterministic for SSR; read browser state after hydration. Focus visibility, keyboard access, labels, and readable contrast remain requirements for every skin.

## Contracts while customizing

Visual changes must preserve signed OAuth query forwarding, real same-page locale links (path/query/hash), auth capability parity, server authorization, and error/pending feedback. New product visuals and motion do not need to match a reference platform's appearance. Platform behavior still follows the contracts in `CONTEXT.md` and the ADRs.

## Reference choices

Reviewed on 2026-10-09. These are organizational references, not runtime dependencies or copied implementations.

| Reference | Practice adopted |
|---|---|
| [Base UI styling](https://base-ui.com/react/handbook/styling) and [animation](https://base-ui.com/react/handbook/animation) | Unstyled interactions, explicit presentation, native state and lifecycle hooks |
| [Cove Stack](https://github.com/mugnavo/cove) | Working TanStack Start/Query/Better Auth/Drizzle scaffold with documented environment and customization points |
| [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) | Clear ownership of app, auth, data, and UI; applied here as directories in the existing standalone app |
| [TanStack Start examples](https://tanstack.com/start/latest/docs/framework/react/getting-started) | Framework-native routing and full-stack foundations rather than a replacement application framework |

Keep the existing Bun, Workers, Hyperdrive, and platform contracts. Add dependencies only for capabilities used by the actual product.
