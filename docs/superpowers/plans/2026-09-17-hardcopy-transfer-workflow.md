# Hardcopy Transfer Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Replace the hardcopy transfer request’s single-approver flow with a Workflow Builder-backed sequential route and return the approved transfer to the requester for physical completion.

**Architecture:** Reuse the existing `WorkflowDefinition`/`WorkflowVersion` graph format and fixed system roles. Add transfer-specific persisted workflow steps and immutable workflow snapshots to `HardcopyTransferRequest`, then enforce the current assigned step in the transfer service. Add a dedicated Angular transfer workspace for requester and reviewer actions while leaving document-request workflows untouched.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest, Angular standalone components, RxJS, PrimeNG/Tailwind panel styles.

**Spec:** `docs/superpowers/specs/2026-09-17-hardcopy-transfer-workflow-design.md`

## Global Constraints

- Preserve existing hardcopy document validation, destination validation, and storage update behavior.
- Do not bypass Workflow Builder assignment checks with a hardcoded approver fallback.
- Keep the five fixed roles: Admin, Internal Audit, Documentation Officer, Staff, and Plant Manager.
- Return-for-revision always requires remarks and records the actor and reason.
- Commit each independently verified task with a focused conventional commit.

---

### Task 1: Persist transfer workflow snapshots and steps

**Files:**
- Modify: `pk-dts-backend/prisma/schema.prisma`
- Create: `pk-dts-backend/prisma/migrations/20260917110000_hardcopy_transfer_workflow/migration.sql`
- Test: `pk-dts-backend/src/api/v1/hardcopy-transfers/hardcopy-transfers.service.spec.ts`

**Interfaces:**
- Add transfer request fields for `workflow_version_id`, `workflow_version`, `workflow_name`, `workflow_snapshot`, and `current_workflow_step_id`.
- Add `HardcopyTransferWorkflowStep` with `node_key`, `sequence`, `stage`, `stage_label`, assignment metadata, decision metadata, and `PENDING`/`QUEUED`/`APPROVED`/`RETURNED`/`REJECTED` states.
- Add `HardcopyTransferWorkflowStepHistory` for reassignment/decision audit details.

- [ ] Write a failing service test proving a submitted transfer creates ordered transfer steps and snapshots the published version.
- [ ] Run the focused test and verify it fails because transfer workflow persistence is absent.
- [ ] Add the Prisma models, enums, relations, indexes, and a forward-only migration that preserves existing transfer rows.
- [ ] Generate Prisma client and rerun the focused test to confirm the schema compiles.
- [ ] Commit with `feat(hardcopy-transfer): persist workflow steps and snapshots`.

### Task 2: Seed and expose the default Workflow Builder transfer route

**Files:**
- Modify: `pk-dts-backend/src/common/constants/system-workflow.ts`
- Modify: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-definitions.service.ts`
- Modify: `pk-dts-backend/prisma/seed.ts`
- Modify: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-graph.types.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.types.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.ts`
- Test: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-definitions.service.spec.ts`
- Test: `pk-dts-backend/src/api/v1/documents/workflow-runtime.spec.ts`

**Interfaces:**
- Define `system-hardcopy-transfer` as the default transfer workflow key.
- Keep `system-hardcopy-direct-approval` for existing hardcopy document requests.
- The transfer graph has role/user assignments for Plant Manager, Documentation Officer, and configurable Final Approver, with version 1 published by seed only when absent.

- [ ] Add a failing default-lookup test for the transfer workflow key and graph stages.
- [ ] Run the test and verify the missing-key failure.
- [ ] Implement the key mapping, seeded graph, and Builder display/filter support without changing existing workflow defaults.
- [ ] Verify the default graph validates as a sequential workflow and published version lookup returns version 1.
- [ ] Commit with `feat(workflow-builder): add hardcopy transfer default route`.

### Task 3: Execute the transfer workflow sequentially

**Files:**
- Modify: `pk-dts-backend/src/api/v1/hardcopy-transfers/hardcopy-transfers.service.ts`
- Modify: `pk-dts-backend/src/api/v1/hardcopy-transfers/hardcopy-transfers.controller.ts`
- Modify: `pk-dts-backend/src/api/v1/hardcopy-transfers/dto/create-hardcopy-transfer.dto.ts`
- Test: `pk-dts-backend/src/api/v1/hardcopy-transfers/hardcopy-transfers.service.spec.ts`
- Test: `pk-dts-backend/src/api/v1/hardcopy-transfers/hardcopy-transfers.controller.spec.ts`

**Interfaces:**
- `submit` resolves the published transfer graph, creates the step snapshot, and makes only Plant Manager pending.
- `approve`, `return`, and `reject` operate only on the current pending assigned step.
- `resubmit` resets the route from the requester back to Plant Manager after a return.
- Final approval changes the request to `ForTransfer` and assigns the requester as the completion actor.
- `complete` accepts requester remarks, updates hardcopy storage and transfer status atomically, and records completion history.

- [ ] Add failing tests for stage-by-stage approval, wrong-user rejection, return remarks, final requester handoff, and requester-only completion.
- [ ] Run the tests and confirm each fails for the missing current-step behavior.
- [ ] Implement graph loading, assignment resolution for `ROLE` and `USER`, step creation, current-step transitions, audit history, and atomic completion.
- [ ] Keep legacy records readable; prevent legacy endpoint calls from bypassing a configured current step.
- [ ] Run the focused service/controller suites and commit with `feat(hardcopy-transfer): enforce sequential approval and completion`.

### Task 4: Add requester and reviewer frontend workspaces

**Files:**
- Create: `pk-dts-frontend/src/app/panel/pages/hardcopy-transfers/hardcopy-transfers.types.ts`
- Create: `pk-dts-frontend/src/app/panel/pages/hardcopy-transfers/hardcopy-transfers.service.ts`
- Create: `pk-dts-frontend/src/app/panel/pages/hardcopy-transfers/hardcopy-transfers.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/panel.routes.ts`
- Modify: `pk-dts-frontend/src/app/panel/panel-access.config.ts`
- Modify: `pk-dts-frontend/src/app/panel/panel-layout.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/documents.page.ts`

**Interfaces:**
- Requester view calls `/hardcopy-transfers/mine`; reviewer view calls `/hardcopy-transfers/pending`.
- The page exposes Create, Submit, Approve, Return for Revision, Reject, Resubmit, and Complete Physical Transfer according to status and current actor.
- Return and completion remarks use a modal with required validation; remarks are not duplicated in cards or tables.

- [ ] Add frontend type/service tests for endpoint payloads and action mapping.
- [ ] Run frontend focused tests to establish the expected failures.
- [ ] Implement the page with the existing panel layout, responsive timeline, destination summary, and required-remarks modal.
- [ ] Add the hardcopy-document action that opens a transfer request for an eligible approved/completed hardcopy.
- [ ] Add routes/navigation and verify role/permission visibility for Staff, Plant Manager, Documentation Officer, Internal Audit, and Admin.
- [ ] Run the frontend test/build and commit with `feat(hardcopy-transfer): add requester and reviewer workspace`.

### Task 5: Verify migrations, regressions, and integration behavior

**Files:**
- Modify only files required by failing verification.
- Test: backend focused suites and frontend production build.

- [ ] Run Prisma formatting/generation and validate the migration SQL.
- [ ] Run backend hardcopy-transfer, workflow-definition, workflow-runtime, and permission suites.
- [ ] Run the frontend production build and relevant unit tests.
- [ ] Inspect git diff for unintended changes and verify the original main worktree’s unrelated deletion remains untouched.
- [ ] Commit any verification-only correction separately with an appropriate `fix(...)` message.

