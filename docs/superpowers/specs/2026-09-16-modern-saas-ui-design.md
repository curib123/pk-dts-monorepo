# Modern SaaS UI Design Specification

**Status:** Approved in chat on 2026-09-16

**Scope:** All routed product screens, including authentication, public fallback/error screens, the authenticated panel, shared controls, and dialogs.

## Goal

Give every product screen one modern SaaS visual language and one reusable page composition while preserving all existing application behavior. The result should feel like one coherent document workspace rather than a collection of independently styled pages.

## Non-goals and hard boundaries

- Do not change API calls, services, models, DTOs, route permissions, role behavior, workflow transitions, validation rules, or business decisions.
- Do not remove, rename, or reinterpret form controls, `formControlName` values, `ngModel` bindings, event handlers, outputs, inputs, or observable/signal state.
- Do not remove functional fields, table columns, actions, tabs, dialogs, filters, loading states, error states, or empty states.
- Do not add a second visual theme. The existing light-only deep-maroon brand tokens remain the single source of truth.
- Do not redesign internal UI-kit/demo routes as product requirements; they are not registered in the current application route tree.

Only templates, CSS/SCSS, shared visual components, layout composition, copy hierarchy, and responsive presentation are in scope.

## Product surfaces in scope

### Authentication and fallback surfaces

- Login
- Registration and registration-status mode
- Access denied
- Error
- Not found

### Authenticated panel shell

- Sidebar navigation, navigation groups, active states, counts, profile block, and sign-out action
- Top bar, page identity, notification center, account summary, mobile navigation, and responsive content frame

### Panel page families

- Dashboard and summary metrics
- Document catalog, softcopy, hardcopy, search, filters, table view, and card view
- My document requests and my disposal requests
- Document access requests and review queue
- Document approval review and disposal approval tabs
- Softcopy folders
- Audit logs and document timeline
- User accounts and user dialogs
- Roles and permissions and permission/resource dialogs
- Storage and classification and resource dialogs
- System settings
- Backup and restore
- Workflow builder and its graph/editor states
- Profile

### Shared visual components

- Table shell, record grid/card, loading shimmer, pagination, data-view switch, searchable dropdown, alert modal, and confirmation dialog
- Document detail, document form, document status, document assignment, revision upload, and folder upload dialogs

## Recommended visual system

### Brand and tokens

Use the existing `BrandPreset` and aliases from `src/app/theme/brand-preset.ts` and `src/assets/styles.scss`:

- Primary: deep maroon for primary actions, active navigation, key accents, and focused states.
- Deep primary: darker maroon for headings, emphasis, navigation surfaces, and high-contrast action states.
- Soft primary: pale maroon surfaces for selected rows, callouts, banners, and non-destructive emphasis.
- Neutral surfaces: warm light background, white cards, subtle muted surfaces, and slate text hierarchy.
- Semantic colors: green for success/approved, amber for pending/revision/warning, red/maroon for destructive/rejected, and blue only for informational meaning.

Central tokens should define page background, surface, raised surface, border, strong border, heading text, body text, muted text, focus ring, small/medium/large shadows, radii, spacing, and responsive content widths. Page-level styles should consume tokens instead of introducing raw color values.

### Typography and spacing

- Use a compact SaaS hierarchy: eyebrow, page title, supporting description, section title, label, value, and helper/error copy.
- Use a consistent spacing scale based on `.25rem` increments, with common section gaps of `1rem`, `1.25rem`, and `1.5rem`.
- Use medium rounded corners for controls and larger corners for cards, dialogs, and hero panels.
- Keep important content dense enough for document operations while preserving generous whitespace around section boundaries.

### Interaction states

Every interactive visual must have consistent default, hover, focus-visible, active, disabled, loading, selected, error, and empty presentation. Focus indicators must be visible against both light surfaces and the deep-maroon shell. Existing action availability remains controlled by existing conditions and permissions.

## Reusable page templates

### `app-page-shell`

A visual wrapper for panel pages with a page header region, optional header actions, content sections, and consistent responsive width. It must accept projected content and must not own data loading, permissions, routing, or action behavior.

### `app-section-card`

A visual card for related content with optional eyebrow, icon, title, description, toolbar, and footer projection. It must not alter projected controls or their event flow.

### `app-status-chip` and state presentation classes

Shared status styling for workflow, request, approval, registration, backup, and catalog states. The components/classes receive display values only; they do not map or change domain state.

### `app-data-toolbar`

A responsive visual row for search, filters, view switch, refresh, pagination context, and primary actions. Existing controls remain in their owning page and retain their original bindings.

### `app-auth-shell`

A shared responsive authentication frame for login and registration, with the existing branding, cover image, navigation links, forms, receipts, and status content projected into slots. Access and error screens use the same brand framing with a simpler centered state card.

### Dialog visual shell

Existing dialogs should share one header, close affordance, content spacing, footer action row, validation-message layout, and mobile full-width treatment. Dialog-specific fields and actions remain unchanged.

## Page composition standard

Each panel page should visually follow this order where its existing content supports it:

1. Page header with eyebrow, title, supporting text, and existing page actions.
2. Optional metrics or context strip using existing counts/status values.
3. Filter/search/action toolbar using the existing controls.
4. Main data region as the shared table shell or responsive record grid.
5. Empty, loading, error, and pagination states in the same visual language.
6. Existing dialogs and confirmation surfaces using the shared dialog shell.

Pages that are editors, builders, timelines, or settings screens may use a specialized content arrangement, but they must use the same header, card, field, action, and state primitives.

## Adoption strategy

1. Establish global tokens and shared primitive styles without changing data or control behavior.
2. Apply the shared authentication shell to login, registration, access, error, and not-found screens.
3. Normalize the panel shell, navigation, top bar, notifications, mobile behavior, and content width.
4. Migrate dashboard, documents, requests, approvals, folders, audit, and profile pages to the page composition standard.
5. Migrate administration, storage, settings, backup, permissions, and workflow-builder pages while preserving specialized editor layouts.
6. Normalize all shared components and dialogs, then remove only duplicate presentation rules that are proven unused.
7. Run visual consistency checks and review every routed product screen at desktop and mobile widths.

## File ownership boundaries

- Global tokens and shared primitives: `pk-dts-frontend/src/assets/styles.scss` and new focused files under `src/app/shared/components/` or `src/app/shared/styles/`.
- Panel shell: `src/app/panel/panel-layout.component.ts` and `src/app/panel/panel-layout.component.scss`, presentation-only changes.
- Auth shell and screens: `src/app/pages/auth/` and `src/app/pages/notfound/`, presentation-only changes.
- Page families: existing `src/app/panel/pages/**` templates and style files; services and type files remain unchanged unless a type-only import is required by a new presentational component.
- Dialogs: existing dialog component templates and styles, with shared visual shell adoption only.

## Validation and acceptance criteria

- Every routed product screen uses the same token set and page/card/control language.
- Desktop, tablet, and mobile layouts remain usable without horizontal overflow except inside intentionally scrollable data tables.
- All existing form submissions, filters, pagination, navigation, dialogs, API calls, validation messages, permission gates, workflow actions, and loading/error behavior remain functionally identical.
- Existing frontend unit tests continue to compile and pass where the environment supports the browser runner.
- `npm.cmd run build` passes in `pk-dts-frontend`.
- `npx.cmd tsc -p tsconfig.spec.json --noEmit` passes in `pk-dts-frontend`.
- `git diff --check` passes, and each coherent implementation slice is committed separately.
- Browser visual verification is recorded separately from build/test evidence; missing Chrome or unavailable runtime infrastructure is reported honestly.
