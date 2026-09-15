# Role-Aware Navigation and Route Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sidebar visibility, route access, and default landing behavior use one shared permission-driven policy so each PK-DTS role sees only relevant workspaces and tasks.

**Architecture:** Add a focused `panel-access.config.ts` registry containing permission requirements and sidebar metadata. Routes and the panel layout consume exported access constants/helpers instead of maintaining separate hard-coded matrices. Existing mixed pages are reused with route modes for requester/reviewer/profile/folder-only experiences.

**Tech Stack:** Angular 21, TypeScript 5.9, RxJS, Jasmine/Karma.

**Spec:** `docs/superpowers/specs/2026-09-15-role-aware-navigation-access.md`

## Global Constraints
- Keep the five fixed roles.
- Authorization remains permission-driven; role checks are presentation-only when used to reduce Admin sidebar clutter.
- Do not add a new authorization library.
- Backend permissions remain authoritative.
- Reuse existing pages instead of duplicating requester/admin/reviewer components.
- Preserve compatibility routes where practical.

---

### Task 1: Shared panel access registry

**Files:**
- Create: `pk-dts-frontend/src/app/panel/panel-access.config.ts`
- Create: `pk-dts-frontend/src/app/panel/panel-access.config.spec.ts`

**Interfaces:**
- Produces `PANEL_NAVIGATION`, `PANEL_ROUTE_PERMISSIONS`, `canAccessPanelItem()`, `shouldShowPanelItem()`, `firstAuthorizedPanelUrl()`.
- Consumes a lightweight `{ roleName, permissions, notificationCount? }` context rather than Angular services.

- [ ] Write tests proving Staff does not see Administration/System items, Internal Audit sees audit/read-only items, Admin hides personal requester shortcuts, and first-authorized routing uses the same registry.
- [ ] Run the focused test and confirm it fails before implementation.
- [ ] Implement typed navigation items/categories and helpers with ANY-permission semantics.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit the registry and tests.

### Task 2: Make route guards consume shared access definitions

**Files:**
- Modify: `pk-dts-frontend/src/app/auth/auth.guard.ts`
- Modify: `pk-dts-frontend/src/app/panel/panel.routes.ts`

**Interfaces:**
- Imports `firstAuthorizedPanelUrl` and route permission constants from Task 1.
- Adds requester/reviewer/profile/folder-only routes using existing components and route data modes.

- [ ] Add/adjust tests if an existing guard test surface is available; otherwise rely on the pure helper tests from Task 1 plus route metadata audit.
- [ ] Replace the duplicate `firstAuthorizedPanelUrl()` list in `auth.guard.ts` with the shared helper.
- [ ] Guard `approval-review` with document review/approval permissions.
- [ ] Guard `users` with user-management permissions.
- [ ] Tighten `/storage` to storage/location administration permissions.
- [ ] Add `/softcopy-folders` as a direct folder-only component route.
- [ ] Add `/my-access-requests`, `/access-review`, and `/my-profile` modes while retaining `/document-access-requests` as compatibility mode.
- [ ] Run frontend build/type-check command.
- [ ] Commit route/guard changes.

### Task 3: Make the sidebar consume the shared registry

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/panel-layout.component.ts`

**Interfaces:**
- Consumes `PANEL_NAVIGATION` and `shouldShowPanelItem()` from Task 1.
- Keeps existing notification-count behavior and empty-category removal.

- [ ] Remove local `PanelNavItem`/`PanelNavCategory` definitions and duplicate navigation arrays.
- [ ] Derive visible primary items/categories from the shared registry using current role, permissions, and notification counts.
- [ ] Preserve notification badges and contextual Approval Requests visibility.
- [ ] Update URL-title fallback for new routes.
- [ ] Run frontend build/type-check command.
- [ ] Commit sidebar changes.

### Task 4: Add role-appropriate route modes to existing mixed pages

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/document-access-requests/document-access-requests.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/user-account/user-account.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/storage-classification/storage-classification.page.ts`

**Interfaces:**
- `DocumentAccessRequestsPage`: route data `mode: 'requester' | 'reviewer' | 'all'`.
- `UserAccountPage`: route data `mode: 'profile' | 'manage'`.
- `StorageClassificationPage`: route data `folderOnly: boolean`.

- [ ] Update Document Access Requests so requester mode cannot display/load the approval queue and reviewer mode cannot display/load requester/catalog tabs.
- [ ] Update User Account so profile mode does not load/display user management or registration review; management mode preserves existing behavior.
- [ ] Update Storage & Classification so folder-only mode exposes only `softcopyCategories` regardless of broader role capabilities.
- [ ] Run frontend build/type-check command.
- [ ] Commit page-mode changes.

### Task 5: Final permission/role UX audit

**Files:**
- Review: `pk-dts-backend/src/common/constants/permission-catalog.ts`
- Review: `pk-dts-frontend/src/app/panel/panel-access.config.ts`
- Review: `pk-dts-frontend/src/app/panel/panel.routes.ts`

**Interfaces:**
- No new backend permissions required unless the audit finds a genuine gap.

- [ ] Compare default permission bundles for Staff, Plant Manager, Documentation Officer, Internal Audit, and Admin against expected sidebar visibility.
- [ ] Confirm each sidebar item has matching route permission metadata.
- [ ] Confirm no route intended for administration has an empty permission list.
- [ ] Confirm page action controls remain permission-driven.
- [ ] Run `npm test -- --watch=false` if Chrome/Karma is available; otherwise run the focused tests if the repository environment supports them.
- [ ] Run `npm run build`.
- [ ] Report any verification commands that still require the user's Docker machine instead of claiming they passed.