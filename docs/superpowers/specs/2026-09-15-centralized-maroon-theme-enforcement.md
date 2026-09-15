# Centralized Deep-Maroon Theme Enforcement

## Goal

Make the PK DTS frontend use one centrally owned visual color system based on deep red / maroon, with `#800000` as the primary brand color. No page, component, dialog, modal, sidebar, topbar, form, table, document view, authentication screen, or shared UI element may own an independent color palette.

The finished frontend must remain readable by using centralized light neutral surfaces and text tones, but all accent and state emphasis must come from the same maroon family.

## Scope

This refactor applies to all application-authored frontend runtime sources under `pk-dts-frontend/src`, including:

- authentication screens
- panel shell, sidebar, topbar, menus, notifications, and navigation
- all panel pages and page-local inline styles
- all shared components
- all dialogs and modals
- all document components and document pages
- `document-grid.scss`
- `document-detail-modern.scss`
- workflow builder styles
- legacy Sakai layout styles that are still compiled into the application
- Tailwind utility usage in Angular templates and inline templates
- PrimeNG component styling and severity appearances

Generated assets, raster images, third-party package CSS, and flag sprite CSS are not rewritten. Application code must not introduce new colors to compensate for those assets.

## Single Source of Truth

`src/app/theme/brand-preset.ts` is the only application source file allowed to contain raw visual color values.

It owns:

- the maroon palette
- the light neutral surface palette
- PrimeNG primary color mapping
- any PrimeNG semantic color mapping needed to force success, warning, info, and danger appearances into the same maroon family

The primary brand color remains:

- `#800000` — Deep Maroon

All other maroon shades are derived members of the centralized palette. Light surfaces and readable text tones remain centrally defined neutral values.

No feature code may contain raw color literals such as hex, rgb/rgba, hsl/hsla, named CSS colors used as styling values, or independent JavaScript/TypeScript color maps.

## Runtime Theme Tokens

`src/assets/styles.scss` exposes application-level semantic CSS custom properties that derive from PrimeNG theme variables. Feature code consumes only these tokens or Tailwind aliases that map to them.

Required token groups include:

### Brand

- `--brand-primary`
- `--brand-primary-hover`
- `--brand-primary-active`
- `--brand-primary-deep`
- `--brand-primary-dark`
- `--brand-primary-darkest`
- `--brand-soft`
- `--brand-soft-strong`
- `--brand-border`
- `--brand-contrast`

### Surfaces and Text

- `--app-background`
- `--app-surface`
- `--app-surface-muted`
- `--app-surface-soft`
- `--app-border`
- `--app-border-strong`
- `--app-text`
- `--app-heading`
- `--app-text-muted`
- `--app-text-faint`

### Interaction and Chrome

- `--app-focus-ring`
- `--app-overlay`
- `--app-disabled`
- `--app-shadow-sm`
- `--app-shadow-md`
- `--app-shadow-lg`
- sidebar/topbar aliases derived from the same brand and surface tokens

Legacy `--dts-*` variables may remain only as compatibility aliases pointing to these centralized variables. They must not own raw values.

## Tailwind Policy

`src/assets/tailwind.css` defines token-backed application color aliases. Templates use those aliases instead of built-in hue families such as slate, red, green, emerald, amber, blue, sky, violet, indigo, teal, orange, yellow, pink, or rose.

Examples of forbidden feature utilities after migration:

- `text-slate-900`
- `bg-emerald-50`
- `text-amber-600`
- `border-red-200`
- `ring-sky-100`

Equivalent token-backed utilities or CSS-variable classes must be used instead.

## Status and Severity Behavior

Success, warning, info, error, pending, approved, rejected, destructive, and other statuses may still differ by icon, label, copy, shape, or emphasis level, but not by hue family.

All state colors must resolve to the centralized maroon palette. For example:

- success may use a check icon plus a soft maroon background
- warning may use a triangle icon plus a stronger maroon border
- error may use a cross icon plus a deep maroon emphasis
- info may use an info icon plus a light maroon treatment

PrimeNG severity APIs may remain where required for component behavior, but their rendered colors must be centrally normalized to maroon. Feature-level code must not choose distinct green/yellow/blue/red palettes.

## Refactor Strategy

1. Expand `brand-preset.ts` and global application tokens so every common visual role has a centralized value.
2. Add token-backed Tailwind aliases.
3. Strengthen the maroon regression checker before migrating feature code.
4. Recursively migrate application-authored frontend files, replacing:
   - hardcoded hex/rgb/hsl colors
   - non-maroon Tailwind hue utilities
   - local color maps and status-color switch statements
   - page-specific color CSS variables with raw values
   - PrimeNG severity color overrides that introduce non-maroon hues
5. Keep layout, spacing, typography, icons, and component behavior unchanged unless a style change is necessary to remove color ownership.
6. Run a repository-wide scan again and fix every remaining violation in application source.

## Automated Enforcement

`pk-dts-frontend/scripts/check-maroon-theme.cjs` becomes a recursive theme-policy guard rather than a four-file spot check.

It scans application-authored frontend runtime source and fails when it finds prohibited color ownership outside the approved centralized theme file.

The guard must detect at least:

- hex colors
- `rgb()` / `rgba()`
- `hsl()` / `hsla()`
- hardcoded Tailwind hue utilities
- local arrays/maps/constants whose purpose is selecting visual colors
- legacy bright-red values such as `#dc2626` and `#991b1b`
- multiple selectable application color themes

The guard may allow structural keywords such as `transparent`, `currentColor`, `inherit`, and centralized CSS variables.

Any necessary exemptions must be explicit, narrow, documented in the checker, and limited to non-application assets or centralized theme definitions.

## Compatibility

The application remains light-mode only. Existing persisted appearance settings are normalized to the single default maroon theme so older stored values do not reactivate other palettes.

No backend API contract should need to change for this refactor. Existing appearance fields may remain for compatibility, but the frontend exposes and renders one theme only.

## Testing and Verification

Implementation is complete only when all of the following pass on the final branch commit:

1. Recursive centralized-theme policy check.
2. Angular production build.
3. Full frontend headless test suite.
4. A final repository diff review confirming no unrelated behavioral refactor was introduced.

The theme checker must fail first against the current source before the migration, proving it catches existing hardcoded and multi-hue styling, then pass after the refactor.

## Acceptance Criteria

- `#800000` remains the canonical primary brand color.
- Raw application color values exist only in `brand-preset.ts`.
- Pages, components, dialogs, modals, sidebar, topbar, tables, forms, auth screens, document views, and shared controls use centralized tokens.
- No application feature uses independent green, yellow, blue, violet, teal, orange, rose, or other hue systems.
- Statuses remain understandable through icons/text/emphasis while using the maroon family.
- User-selectable alternative color themes are absent.
- CI prevents future feature code from reintroducing hardcoded or independent colors.
- Production build and full frontend tests pass.
