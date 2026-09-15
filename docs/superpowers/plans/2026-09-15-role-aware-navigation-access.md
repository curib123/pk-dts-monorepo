# Role-Aware Navigation and Route Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make sidebar visibility, route access, and default landing behavior use one shared permission-driven policy so each PK-DTS role sees only relevant workspaces and tasks.

**Architecture:** Use `panel-access.config.ts` as the single frontend registry for navigable workspace permissions and sidebar metadata. Routes and the panel layout consume the same definitions. Reuse DocumentAccessRequests with requester/reviewer modes, but use small dedicated MyProfile and SoftcopyFolders pages so ordinary users never enter the large administration workspaces.

**Tech Stack:** Angular 21, TypeScript 5.9, RxJS, Jasmine/Karma; NestJS/Jest for the self-profile backend guard.

**Spec:** `docs/superpowers/specs/2026-09-15-role-aware-navigation-access.md`

## Global Constraints
- Keep the five fixed roles.
- Authorization remains permission-driven; role checks are presentation-only when used to reduce Admin sidebar clutter.
- Do not add a new authorization library.
- Backend permissions remain authoritative.
- Workspace-entry permissions are distinct from action permissions.
- Preserve compatibility routes where practical.

---

### Task 1: Shared panel access registry

**Files:**
- Create: `pk-dts-frontend/src/app/panel/panel-access.config.ts`
- Create: `pk-dts-frontend/src/app/panel/panel-access.config.spec.ts`

- [x] Add typed navigation items/categories and shared permission helpers.
- [x] Cover Staff, Plant Manager, Documentation Officer, Internal Audit, Admin presentation behavior.
- [x] Ensure action-only permissions do not expose read workspaces.
- [x] Use the registry for first-authorized landing behavior.
- [ ] Execute focused frontend tests in a runnable checkout.

### Task 2: Align routes and guard with the shared registry

**Files:**
- Modify: `pk-dts-frontend/src/app/auth/auth.guard.ts`
- Modify: `pk-dts-frontend/src/app/panel/panel.routes.ts`

- [x] Remove duplicate first-authorized route matrix from the guard.
- [x] Apply shared route permission constants.
- [x] Guard Approval Review and User Management explicitly.
- [x] Separate `/softcopy-folders` from `/storage`.
- [x] Add `/my-access-requests`, `/access-review`, and `/my-profile`.
- [x] Retain `/document-access-requests` as compatibility all-mode route.
- [ ] Execute frontend build/type-check.

### Task 3: Make the sidebar consume the shared registry

**File:**
- Modify: `pk-dts-frontend/src/app/panel/panel-layout.component.ts`

- [x] Remove duplicate local navigation matrices.
- [x] Derive visible items/categories from current permissions and presentation rules.
- [x] Hide empty categories.
- [x] Preserve notification badges.
- [x] Add metadata/title support for new routes.
- [ ] Execute frontend build/type-check.

### Task 4: Separate requester/reviewer and ordinary/admin workspaces

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/document-access-requests/document-access-requests.page.ts`
- Create: `pk-dts-frontend/src/app/panel/pages/my-profile/my-profile.page.ts`
- Create: `pk-dts-frontend/src/app/panel/pages/my-profile/my-profile.page.spec.ts`
- Create: `pk-dts-frontend/src/app/panel/pages/softcopy-folders/softcopy-folders.page.ts`
- Create: `pk-dts-frontend/src/app/panel/pages/softcopy-folders/softcopy-folders.page.spec.ts`

- [x] Requester mode does not load/show the reviewer queue.
- [x] Reviewer mode does not load/show requester/catalog work.
- [x] My Profile loads only the signed-in account and keeps role/leader read-only.
- [x] Softcopy Folders exposes only folder hierarchy/actions.
- [x] Folder create/edit/delete controls follow their individual permissions.
- [x] Existing User Management and Storage & Classification pages remain administration workspaces.
- [ ] Execute focused component tests and frontend build.

### Task 5: Protect self-service workflow identity fields

**Files:**
- Create: `pk-dts-backend/src/api/v1/users/users.controller.spec.ts`
- Modify: `pk-dts-backend/src/api/v1/users/users.controller.ts`

- [x] Add regression test that normal self-service cannot change role or leader assignment.
- [x] Strip both `role_id` and `leader_id` for non-management self updates.
- [x] Preserve full update capability for users with account-management permission.
- [ ] Execute focused backend test and backend build.

### Task 6: Final permission/role UX audit and verification

- [x] Compare default Staff, Plant Manager, Documentation Officer, Internal Audit, and Admin permissions against navigation expectations.
- [x] Confirm sidebar and route metadata share the same access definitions.
- [x] Confirm administration routes are not left with empty permission lists.
- [x] Confirm page actions remain permission-driven.
- [x] Confirm accidental intermediate GitHub file was not retained in the final branch diff.
- [ ] Frontend: run focused specs and `npm run build`.
- [ ] Backend: run `users.controller.spec.ts` and `npm run build`.
- [ ] Docker: rebuild and smoke-test all five roles before merge.
- [ ] Do not claim green verification until those commands complete successfully.
