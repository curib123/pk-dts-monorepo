# Frontend Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the time and work required to open the authenticated panel without changing permissions, API contracts, business rules, or user workflows.

**Architecture:** Keep the existing Angular route tree and panel layout, but replace eager child-page references with route-level `loadComponent` factories so each workspace is loaded only when opened. Keep profile refresh behavior intact, start non-critical notification polling after the first panel paint, and reduce Windows bind-mount polling frequency while retaining live reload.

**Tech Stack:** Angular 21 standalone routes, Karma/Jasmine, Docker Compose, NestJS/Prisma unchanged.

**Spec:** Approved performance scope in chat on 2026-09-18.

## Global Constraints

- Preserve all existing route paths, route data, guards, permissions, API calls, and business logic.
- Preserve existing user-visible workflow and notification refresh cadence after the initial panel render.
- Do not modify the user's unrelated deleted documentation files.
- Use `npm.cmd` in PowerShell and commit each independently verified change.

---

### Task 1: Lazy-load panel workspace pages

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/panel.routes.ts`
- Test: `pk-dts-frontend/src/app/panel/panel.routes.spec.ts`

**Interfaces:**
- Consumes: Existing route paths, route metadata, `PanelLayoutComponent`, and standalone page components.
- Produces: The same `Routes` configuration with `loadComponent` factories for child pages.

- [ ] **Step 1: Add a failing route-loading regression test**

Assert that a representative child route exposes a `loadComponent` function and does not eagerly assign a component.

- [ ] **Step 2: Run the focused frontend spec and verify it fails**

Run from `pk-dts-frontend`:

```powershell
npm.cmd test -- --watch=false --include=src/app/panel/panel.routes.spec.ts
```

Expected: the new lazy-loading assertion fails against the current eager route configuration.

- [ ] **Step 3: Convert child page imports to `loadComponent` factories**

Remove eager page imports and use dynamic imports such as:

```ts
{ path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage), data: { ... } }
```

Keep `PanelLayoutComponent` eager because it owns the authenticated shell, and preserve every existing path and `data` object.

- [ ] **Step 4: Run the focused spec and the frontend build**

Run the route spec and `npm.cmd run build` from `pk-dts-frontend`; both must exit successfully.

- [ ] **Step 5: Commit the route optimization**

```powershell
git add pk-dts-frontend/src/app/panel/panel.routes.ts pk-dts-frontend/src/app/panel/panel.routes.spec.ts
git commit -m "perf(frontend): lazy-load panel workspace pages"
```

### Task 2: Defer non-critical notification requests until after first render

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/panel-layout.component.ts`
- Test: `pk-dts-frontend/src/app/panel/panel-layout.component.spec.ts` if an existing spec is present; otherwise add a focused Jasmine test beside the component.

**Interfaces:**
- Consumes: Existing `DashboardService.getNavigationCounts()` and `NotificationsService.list()` observables.
- Produces: The same notification signals, refresh interval, and error handling with initial requests scheduled after the panel becomes interactive.

- [ ] **Step 1: Add a failing timing/isolation test**

Verify that panel initialization does not synchronously subscribe to notification requests before the first render scheduling point, while profile refresh and route metadata behavior remain unchanged.

- [ ] **Step 2: Run the focused spec and verify the expected failure**

Run the component spec with `npm.cmd test -- --watch=false --include=...` and confirm the failure is caused by immediate notification subscription.

- [ ] **Step 3: Schedule the two existing polling streams after initial render**

Use a short post-render delay or Angular render scheduling hook for only the notification count/feed streams. Preserve the existing 30-second recurrence and `catchError` behavior.

- [ ] **Step 4: Run the focused spec and full frontend tests**

Run the focused component spec and `npm.cmd test -- --watch=false` from `pk-dts-frontend`.

- [ ] **Step 5: Commit the notification scheduling optimization**

```powershell
git add pk-dts-frontend/src/app/panel/panel-layout.component.ts pk-dts-frontend/src/app/panel/panel-layout.component.spec.ts
git commit -m "perf(frontend): defer panel notification polling"
```

### Task 3: Reduce Windows development watcher churn

**Files:**
- Modify: `pk-dts-docker/compose.dev.yaml`

**Interfaces:**
- Consumes: Existing bind-mounted frontend source and Angular live reload command.
- Produces: The same live-reload dev stack with less frequent polling and no production configuration change.

- [ ] **Step 1: Change only the Angular dev-server polling interval**

Raise the existing frontend `--poll` value from 500 ms to 1000 ms, retaining `--hmr`, the bind mount, and the existing container watcher environment.

- [ ] **Step 2: Validate the Compose configuration**

Run:

```powershell
docker compose -p pk-dms-dev -f pk-dts-docker/compose.yaml -f pk-dts-docker/compose.dev.yaml config --quiet
```

- [ ] **Step 3: Commit the watcher optimization**

```powershell
git add pk-dts-docker/compose.dev.yaml
git commit -m "perf(dev): reduce frontend bind-mount polling"
```

### Task 4: Full verification and bundle comparison

**Files:**
- Verify: `pk-dts-frontend/dist/sakai-ng`, backend test/build outputs, Docker route health.

- [ ] **Step 1: Build with stats and compare initial/lazy chunks**

Run `npm.cmd run build -- --stats-json` and record the initial and panel chunk sizes. The panel page code must no longer be bundled into one eager panel-routes chunk.

- [ ] **Step 2: Run backend regression tests and build**

Run `npm.cmd test -- --runInBand` and `npm.cmd run build` from `pk-dts-backend`.

- [ ] **Step 3: Run frontend regression tests and build**

Run `npm.cmd test -- --watch=false` and `npm.cmd run build` from `pk-dts-frontend`.

- [ ] **Step 4: Verify live health endpoints**

Check the existing production `/health`, `/api/v1/health`, `/auth/login`, and `/auth/register` routes without changing database or Redis data.

- [ ] **Step 5: Confirm only intended files changed and report measured results**

Use `git status --short` and `git log --oneline` while preserving the user's unrelated deleted documentation files.
