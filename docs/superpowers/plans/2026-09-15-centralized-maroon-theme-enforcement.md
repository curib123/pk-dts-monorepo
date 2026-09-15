# Centralized Deep-Maroon Theme Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every application-authored frontend surface consume one centralized deep-red/maroon theme, with `#800000` as the canonical primary color and no feature-owned hardcoded or alternate hue systems.

**Architecture:** `src/app/theme/brand-preset.ts` remains the only application source allowed to own raw color values. `src/assets/styles.scss` exposes semantic CSS variables, `src/assets/tailwind.css` exposes token-backed Tailwind aliases, and a recursive policy checker rejects raw colors, non-maroon hue utilities, and local color-selection logic everywhere else. Migration is performed in testable batches: shared UI, shell/auth, panel pages, then document-heavy surfaces.

**Tech Stack:** Angular, TypeScript, SCSS, PrimeNG Aura theme preset, Tailwind CSS, Node.js policy script, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-centralized-maroon-theme-enforcement.md`

## Global Constraints

- `#800000` is the canonical primary brand color.
- `src/app/theme/brand-preset.ts` is the only application source file allowed to contain raw visual color values.
- The application remains light-mode only.
- White/light neutral surfaces are allowed only through centralized theme tokens or token-backed aliases.
- Success, warning, info, error, pending, approved, rejected, destructive, and other state treatments must use the maroon family rather than independent hue families.
- Existing appearance values must normalize to the single default theme.
- No backend API contract changes are part of this refactor.
- Layout, spacing, typography, icons, and component behavior remain unchanged unless a style change is required to remove local color ownership.
- CI must prevent future feature code from reintroducing raw colors or alternate hue systems.

---

## File Structure and Ownership

### Centralized theme ownership

- `pk-dts-frontend/src/app/theme/brand-preset.ts` — owns all raw maroon and neutral palette values plus PrimeNG semantic mappings.
- `pk-dts-frontend/src/assets/styles.scss` — exposes semantic runtime CSS variables only; no independent raw palette.
- `pk-dts-frontend/src/assets/tailwind.css` — defines token-backed aliases for application templates.
- `pk-dts-frontend/src/app/shared/services/system-settings.service.ts` — exposes exactly one theme option and maps all appearance state to centralized values.

### Enforcement

- `pk-dts-frontend/scripts/check-maroon-theme.cjs` — recursively scans runtime frontend source and supports `--path <relative-path>` for batch verification.
- `.github/workflows/maroon-theme-check.yml` — runs the recursive policy guard, production build, and frontend tests.

### Migration groups

- Shared UI: `pk-dts-frontend/src/app/shared/components/**`
- Auth and shell: `pk-dts-frontend/src/app/pages/auth/**`, `pk-dts-frontend/src/app/panel/panel-layout.component.scss`, `pk-dts-frontend/src/app/layout/**`, `pk-dts-frontend/src/assets/layout/**`
- Panel pages: `pk-dts-frontend/src/app/panel/pages/**` excluding `documents/**` until the document task
- Document UI: `pk-dts-frontend/src/app/panel/pages/documents/**`, `pk-dts-frontend/src/document-grid.scss`, `pk-dts-frontend/src/document-detail-modern.scss`

---

### Task 1: Replace the spot-check theme test with a recursive policy guard

**Files:**
- Modify: `pk-dts-frontend/scripts/check-maroon-theme.cjs`
- Modify: `.github/workflows/maroon-theme-check.yml`

**Interfaces:**
- Consumes: repository root `pk-dts-frontend`
- Produces: `node scripts/check-maroon-theme.cjs [--path <relative-path>]` returning exit code `0` only when the requested runtime source contains no policy violations.

- [ ] **Step 1: Rewrite the checker to enumerate runtime source recursively**

Use this shape in `check-maroon-theme.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const pathIndex = args.indexOf('--path');
const scanRoot = pathIndex >= 0 ? args[pathIndex + 1] : 'src';

const allowedRawColorFiles = new Set([
    path.normalize('src/app/theme/brand-preset.ts')
]);

const ignoredFiles = [
    path.normalize('src/assets/demo/flags/flags.css')
];

const sourceExtensions = new Set(['.ts', '.html', '.scss', '.css']);

function walk(relativePath) {
    const absolutePath = path.join(root, relativePath);
    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) return [relativePath];
    return fs.readdirSync(absolutePath).flatMap((name) => walk(path.join(relativePath, name)));
}
```

Add detectors for:

```js
const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/g;
const forbiddenTailwindHue = /\b(?:bg|text|border|ring|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const colorLogicPattern = /(?:color|colour|theme|palette|accent).*?(?:map|options|classes|severity)/i;
```

The checker must report each violation as:

```text
<relative-path>: <rule>: <matched-token>
```

and print a final count before exiting non-zero.

- [ ] **Step 2: Preserve the existing single-theme assertions**

Keep explicit checks that:

```js
BRAND_DEEP_RED === '#800000'
COLOR_THEME_OPTIONS contains exactly one id: 'default'
styles.scss maps legacy --dts-* aliases to centralized --brand-* variables
```

- [ ] **Step 3: Run the policy checker against the current source and verify RED**

Run:

```bash
cd pk-dts-frontend
node scripts/check-maroon-theme.cjs
```

Expected: FAIL with violations from files such as `src/app/shared/components/alert-modal/alert-modal.component.ts` and `src/app/panel/pages/my-profile/my-profile.page.ts`.

- [ ] **Step 4: Update CI to run the recursive guard before build/tests**

Ensure `.github/workflows/maroon-theme-check.yml` contains:

```yaml
- name: Check centralized deep-maroon theme
  run: node scripts/check-maroon-theme.cjs
```

before `npm run build` and the headless test command.

- [ ] **Step 5: Commit**

```bash
git add pk-dts-frontend/scripts/check-maroon-theme.cjs .github/workflows/maroon-theme-check.yml
git commit -m "test(theme): enforce centralized color ownership recursively"
```

---

### Task 2: Complete the centralized palette and semantic token contract

**Files:**
- Modify: `pk-dts-frontend/src/app/theme/brand-preset.ts`
- Modify: `pk-dts-frontend/src/assets/styles.scss`
- Modify: `pk-dts-frontend/src/assets/tailwind.css`
- Modify: `pk-dts-frontend/src/app/shared/services/system-settings.service.ts`

**Interfaces:**
- Consumes: PrimeNG Aura preset tokens.
- Produces: one semantic CSS-variable contract used by every feature surface.

- [ ] **Step 1: Add all raw neutral and maroon values to `brand-preset.ts` only**

Keep:

```ts
export const BRAND_DEEP_RED = '#800000';
```

Extend `MAROON_PALETTE` and the light surface palette only in this file. PrimeNG semantic severity mappings must resolve success/info/warn/danger to members of `MAROON_PALETTE`, not green/blue/yellow/red defaults.

- [ ] **Step 2: Add semantic runtime tokens in `styles.scss`**

Ensure `:root` exposes at least:

```scss
--brand-primary: var(--p-primary-500);
--brand-primary-hover: var(--p-primary-600);
--brand-primary-active: var(--p-primary-700);
--brand-primary-deep: var(--p-primary-800);
--brand-primary-dark: var(--p-primary-900);
--brand-primary-darkest: var(--p-primary-950);
--brand-soft: var(--p-primary-50);
--brand-soft-strong: var(--p-primary-100);
--brand-border: var(--p-primary-200);
--brand-contrast: var(--p-primary-contrast-color);

--app-background: var(--p-surface-50);
--app-surface: var(--p-surface-0);
--app-surface-muted: var(--p-surface-50);
--app-surface-soft: var(--p-surface-100);
--app-border: var(--p-surface-200);
--app-border-strong: var(--p-surface-300);
--app-text: var(--p-surface-900);
--app-heading: var(--p-surface-950);
--app-text-muted: var(--p-surface-600);
--app-text-faint: var(--p-surface-500);

--app-focus-ring: color-mix(in srgb, var(--brand-primary) 18%, transparent);
--app-overlay: color-mix(in srgb, var(--brand-primary-darkest) 28%, transparent);
--app-disabled: var(--p-surface-400);
```

Define status aliases that all point to the maroon family:

```scss
--status-soft: var(--brand-soft);
--status-border: var(--brand-border);
--status-text: var(--brand-primary-deep);
--status-strong: var(--brand-primary);
```

- [ ] **Step 3: Keep legacy aliases centralized**

```scss
--dts-accent: var(--brand-primary);
--dts-accent-deep: var(--brand-primary-deep);
--dts-accent-soft: var(--brand-soft-strong);
```

No `--dts-*` variable may contain a raw color literal.

- [ ] **Step 4: Add token-backed Tailwind aliases in `tailwind.css`**

Expose aliases such as:

```css
@theme inline {
  --color-app-bg: var(--app-background);
  --color-app-surface: var(--app-surface);
  --color-app-surface-muted: var(--app-surface-muted);
  --color-app-border: var(--app-border);
  --color-app-text: var(--app-text);
  --color-app-muted: var(--app-text-muted);
  --color-brand: var(--brand-primary);
  --color-brand-hover: var(--brand-primary-hover);
  --color-brand-deep: var(--brand-primary-deep);
  --color-brand-soft: var(--brand-soft);
  --color-status-soft: var(--status-soft);
  --color-status-text: var(--status-text);
}
```

- [ ] **Step 5: Keep system settings at one theme only**

`COLOR_THEME_OPTIONS` remains:

```ts
export const COLOR_THEME_OPTIONS = [
    {
        id: 'default',
        name: 'Deep Maroon',
        description: 'Centralized PK DTS maroon theme',
        accent: BRAND_DEEP_RED,
        deep: MAROON_PALETTE[800],
        soft: MAROON_PALETTE[100]
    }
] as const;
```

Any persisted old theme id must normalize to `default`.

- [ ] **Step 6: Verify only the central theme files may still contain raw colors**

Run:

```bash
node scripts/check-maroon-theme.cjs --path src/app/theme
node scripts/check-maroon-theme.cjs --path src/assets/styles.scss
```

Expected: PASS because the central theme file is the explicit raw-color exemption and global styles contain token references only.

- [ ] **Step 7: Commit**

```bash
git add pk-dts-frontend/src/app/theme/brand-preset.ts pk-dts-frontend/src/assets/styles.scss pk-dts-frontend/src/assets/tailwind.css pk-dts-frontend/src/app/shared/services/system-settings.service.ts
git commit -m "refactor(theme): define complete centralized maroon token contract"
```

---

### Task 3: Migrate shared components to centralized tokens

**Files:**
- Modify: `pk-dts-frontend/src/app/shared/components/alert-modal/alert-modal.component.ts`
- Modify: `pk-dts-frontend/src/app/shared/components/confirmation-dialog/confirmation-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/shared/components/data-view-switch/data-view-switch.component.ts`
- Modify: `pk-dts-frontend/src/app/shared/components/loading-shimmer/loading-shimmer.component.ts`
- Modify: `pk-dts-frontend/src/app/shared/components/pagination/pagination.component.ts`
- Modify: `pk-dts-frontend/src/app/shared/components/record-grid/record-grid.component.ts`
- Modify: `pk-dts-frontend/src/app/shared/components/searchable-dropdown/searchable-dropdown.component.ts`
- Modify: `pk-dts-frontend/src/app/shared/components/table-shell/table-shell.component.ts`

**Interfaces:**
- Consumes: `--app-*`, `--brand-*`, `--status-*`, and token-backed Tailwind aliases from Task 2.
- Produces: shared primitives with no feature-owned raw colors or hue classes.

- [ ] **Step 1: Replace alert severity color logic with one maroon visual treatment**

Keep severity-specific icons, but return one centralized badge class and no PrimeNG color severity selection:

```ts
severityClasses() {
    const icon = {
        success: 'pi pi-check-circle',
        warning: 'pi pi-exclamation-triangle',
        error: 'pi pi-times-circle',
        info: 'pi pi-info-circle'
    }[this.severity];

    return {
        badge: 'bg-status-soft text-status-text ring-1 ring-inset ring-brand-soft',
        icon,
        buttonSeverity: undefined
    };
}
```

Render the action button with the centralized primary appearance instead of a per-severity hue.

- [ ] **Step 2: Replace embedded raw dialog colors**

Use variables such as:

```scss
background: var(--app-surface);
color: var(--app-text);
border: 1px solid var(--app-border);
box-shadow: var(--app-shadow-lg);
```

Use `var(--app-overlay)` for dialog masks.

- [ ] **Step 3: Apply the same token rule to all other shared components**

Replace every direct hue utility (`text-slate-*`, `bg-emerald-*`, etc.) with token-backed aliases and every raw SCSS color with `var(--...)` tokens.

- [ ] **Step 4: Run the focused policy check**

```bash
node scripts/check-maroon-theme.cjs --path src/app/shared/components
```

Expected: PASS.

- [ ] **Step 5: Run frontend tests**

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add pk-dts-frontend/src/app/shared/components
git commit -m "refactor(theme): centralize shared component colors"
```

---

### Task 4: Migrate authentication and application shell styling

**Files:**
- Modify: `pk-dts-frontend/src/app/pages/auth/login.ts`
- Modify: `pk-dts-frontend/src/app/pages/auth/register.ts`
- Modify: `pk-dts-frontend/src/app/pages/auth/access.ts`
- Modify: `pk-dts-frontend/src/app/pages/auth/error.ts`
- Modify: `pk-dts-frontend/src/app/panel/panel-layout.component.scss`
- Modify: `pk-dts-frontend/src/app/layout/component/app.menu.ts`
- Modify: `pk-dts-frontend/src/app/layout/component/app.menuitem.ts`
- Modify: `pk-dts-frontend/src/app/layout/component/app.sidebar.ts`
- Modify: `pk-dts-frontend/src/app/layout/component/app.topbar.ts`
- Modify: `pk-dts-frontend/src/assets/layout/_core.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_footer.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_main.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_menu.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_preloading.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_responsive.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_topbar.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_typography.scss`
- Modify: `pk-dts-frontend/src/assets/layout/_utils.scss`
- Modify: `pk-dts-frontend/src/assets/layout/variables/_common.scss`
- Modify: `pk-dts-frontend/src/assets/layout/variables/_light.scss`
- Delete if unused after import audit: `pk-dts-frontend/src/assets/layout/variables/_dark.scss`

**Interfaces:**
- Consumes: centralized semantic tokens.
- Produces: auth screens and both shell implementations with no local palette ownership.

- [ ] **Step 1: Replace auth page raw colors with centralized variables**

All auth backgrounds, inputs, borders, text, focus rings, cards, buttons, and overlays must resolve through `--app-*` or `--brand-*` tokens. Preserve image assets and layout.

- [ ] **Step 2: Remove shell-level raw colors and local fallback hex values**

For example, use:

```scss
background: linear-gradient(180deg, var(--brand-primary-deep), var(--brand-primary-darkest));
color: var(--brand-contrast);
```

Never use a fallback like `var(--brand-primary, #800000)` outside the central theme file.

- [ ] **Step 3: Remove dark-theme ownership from compiled legacy layout**

If `_dark.scss` is no longer referenced after the light-only audit, delete it and remove its import. Otherwise make it contain no distinct palette and point its variables to light-mode tokens.

- [ ] **Step 4: Verify focused paths**

```bash
node scripts/check-maroon-theme.cjs --path src/app/pages/auth
node scripts/check-maroon-theme.cjs --path src/app/layout
node scripts/check-maroon-theme.cjs --path src/assets/layout
node scripts/check-maroon-theme.cjs --path src/app/panel/panel-layout.component.scss
```

Expected: PASS for each.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add pk-dts-frontend/src/app/pages/auth pk-dts-frontend/src/app/layout pk-dts-frontend/src/assets/layout pk-dts-frontend/src/app/panel/panel-layout.component.scss
git commit -m "refactor(theme): centralize auth and shell colors"
```

---

### Task 5: Migrate all non-document panel pages and their dialogs

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/approval-review/approval-review.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/audit-logs/audit-logs.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/backup-restore/backup-restore.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/blank-section.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/dashboard/dashboard.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/document-access-requests/document-access-requests.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/document-disposal/document-disposal.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/document-requests/document-requests.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/my-disposal-requests/my-disposal-requests.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/my-profile/my-profile.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/roles-permissions/roles-permissions.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/roles-permissions/components/permission-assignment-dialog/permission-assignment-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/roles-permissions/components/resource-form-dialog/resource-form-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/roles-permissions/components/resource-view-dialog/resource-view-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/softcopy-folders/softcopy-folders.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/storage-classification/storage-classification.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/storage-classification/components/storage-resource-form-dialog/storage-resource-form-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/system-settings/system-settings.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/user-account/user-account.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/user-account/components/user-document-assignment-dialog/user-document-assignment-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/user-account/components/user-form-dialog/user-form-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.html`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.scss`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.ts`

**Interfaces:**
- Consumes: centralized tokens and shared components migrated in Task 3.
- Produces: every non-document panel screen with no local palette.

- [ ] **Step 1: Replace page-level raw CSS literals**

For `my-profile.page.ts`, replace patterns such as:

```scss
color:#991b1b;
background:#fef2f2;
background:#ecfdf5;
color:#166534;
```

with semantic variables such as:

```scss
color: var(--brand-primary-deep);
background: var(--brand-soft);
```

Success/error feedback may differ by icon and copy but must use the same maroon token family.

- [ ] **Step 2: Replace all non-maroon utility classes**

Examples:

```text
text-slate-600 -> text-app-muted
bg-white -> bg-app-surface
border-slate-200 -> border-app-border
bg-emerald-50 -> bg-status-soft
text-emerald-700 -> text-status-text
```

- [ ] **Step 3: Remove local status color switch/maps**

Convert objects/functions that return hue-specific classes into status metadata that returns only icon/label while styling is shared through centralized classes.

- [ ] **Step 4: Verify the non-document page set**

Run the checker for each top-level page directory listed above. Do not use the entire `src/app/panel/pages` path yet because the document task remains intentionally red.

Expected: each migrated directory PASS.

- [ ] **Step 5: Run tests**

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pk-dts-frontend/src/app/panel/pages
git commit -m "refactor(theme): centralize panel page colors"
```

---

### Task 6: Migrate document pages, dialogs, and large document stylesheets

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/documents.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/batch-hardcopy-upload-dialog/batch-hardcopy-upload-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/document-assignment-dialog/document-assignment-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/document-detail-dialog/document-detail-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/document-form-dialog/document-form-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/document-status-dialog/document-status-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/revision-upload-dialog/revision-upload-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/softcopy-folder-upload-dialog/softcopy-folder-upload-dialog.component.ts`
- Modify: `pk-dts-frontend/src/document-grid.scss`
- Modify: `pk-dts-frontend/src/document-detail-modern.scss`

**Interfaces:**
- Consumes: centralized semantic variables and token-backed Tailwind aliases.
- Produces: all document UI with one palette.

- [ ] **Step 1: Migrate dialog inline templates/styles**

Replace raw colors and hue utilities while preserving workflow behavior, file upload logic, validation, and dialog structure.

- [ ] **Step 2: Migrate `documents.page.ts` color logic**

Replace any status-to-color maps with status-to-icon/label maps. Shared class names should resolve to the same maroon variables.

- [ ] **Step 3: Migrate `document-grid.scss`**

Replace every raw color literal with `--app-*`, `--brand-*`, or `--status-*` variables. Keep spacing, responsive breakpoints, grid geometry, and transitions unchanged.

- [ ] **Step 4: Migrate `document-detail-modern.scss`**

Apply the same token-only rule. Do not preserve blue/green/yellow/red sections for status or document type; use iconography/text/weight plus maroon emphasis instead.

- [ ] **Step 5: Verify focused document paths**

```bash
node scripts/check-maroon-theme.cjs --path src/app/panel/pages/documents
node scripts/check-maroon-theme.cjs --path src/document-grid.scss
node scripts/check-maroon-theme.cjs --path src/document-detail-modern.scss
```

Expected: PASS.

- [ ] **Step 6: Build and test**

```bash
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add pk-dts-frontend/src/app/panel/pages/documents pk-dts-frontend/src/document-grid.scss pk-dts-frontend/src/document-detail-modern.scss
git commit -m "refactor(theme): centralize document UI colors"
```

---

### Task 7: Sweep remaining runtime frontend source and remove residual color ownership

**Files:**
- Modify only files reported by the checker under `pk-dts-frontend/src` that are not the approved central theme file or ignored third-party/asset CSS.

**Interfaces:**
- Consumes: the recursive checker from Task 1.
- Produces: zero policy violations across runtime source.

- [ ] **Step 1: Run the whole-source guard**

```bash
node scripts/check-maroon-theme.cjs
```

Expected before fixes: FAIL only if residual files remain outside earlier migration groups.

- [ ] **Step 2: Fix every reported application-authored violation**

Allowed resolutions are limited to:

```text
raw color -> centralized CSS variable
built-in hue utility -> token-backed utility
status color map -> status icon/label metadata + shared maroon styling
legacy local theme variable -> alias to centralized token
```

Do not add checker exemptions for application-authored runtime files merely to make the scan pass.

- [ ] **Step 3: Re-run the whole-source guard**

```bash
node scripts/check-maroon-theme.cjs
```

Expected: PASS with zero violations.

- [ ] **Step 4: Commit**

```bash
git add pk-dts-frontend/src pk-dts-frontend/scripts/check-maroon-theme.cjs
git commit -m "refactor(theme): remove residual frontend color ownership"
```

---

### Task 8: Final verification and diff review

**Files:**
- Verify: all files changed on `refactor/enforce-centralized-maroon-theme`
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: completed theme refactor.
- Produces: a green branch ready for review/merge.

- [ ] **Step 1: Run the recursive policy guard from a clean branch state**

```bash
cd pk-dts-frontend
node scripts/check-maroon-theme.cjs
```

Expected: `Centralized deep-maroon theme regression check passed.` and exit code `0`.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: Angular production bundle succeeds.

- [ ] **Step 3: Run the full frontend test suite**

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

Expected: all tests PASS.

- [ ] **Step 4: Review the branch diff against `main`**

```bash
git diff --stat main...HEAD
git diff main...HEAD -- pk-dts-frontend/src pk-dts-frontend/scripts/check-maroon-theme.cjs .github/workflows/maroon-theme-check.yml
```

Confirm the diff contains theme ownership changes only and no unrelated behavioral refactors.

- [ ] **Step 5: Confirm the one-theme acceptance criteria manually**

Verify:

```text
brand-preset.ts is the only runtime application source containing raw colors
COLOR_THEME_OPTIONS exposes only default / Deep Maroon
no green/amber/blue/violet/etc feature hue utilities remain
status distinctions still retain icons and labels
sidebar, topbar, modals, forms, tables, auth, documents, and shared controls all resolve through centralized tokens
```

- [ ] **Step 6: Commit any verification-only fix if needed**

If no fix is needed, do not create an empty commit. If a fix is required:

```bash
git add <exact-fixed-files>
git commit -m "fix(theme): resolve final centralized theme violations"
```

- [ ] **Step 7: Use `superpowers:verification-before-completion` before claiming completion**

Record the exact final commit SHA and fresh command results before proposing merge/PR handling.
