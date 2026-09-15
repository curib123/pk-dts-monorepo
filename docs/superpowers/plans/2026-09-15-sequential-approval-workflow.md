# Sequential Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the generic workflow graph designer with a safe versioned sequential approval-route builder while preserving existing workflow history and in-progress requests.

**Architecture:** Keep the existing `WorkflowDefinition` / `WorkflowVersion` data model and schema-v2 `graph` JSON as a compatibility wire format. New builder writes are constrained to one linear chain of approval nodes ending in one Approved node. Legacy complex graphs remain executable/readable but are not silently rewritten. This avoids a destructive schema/runtime migration while delivering a simple sequential product model.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Angular, Jest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-15-sequential-approval-workflow.md`

## Global Constraints
- Keep five fixed roles and permission-based authorization.
- Do not add CASL, ABAC, BPM libraries, policy engines, or new workflow dependencies.
- Do not reset or destructively rewrite production data.
- Preserve published-version immutability and in-progress request snapshots.
- New workflow assignment modes are USER, ROLE, REQUESTER_LEADER only.
- Backend remains authoritative for workflow decisions.

---

### Task 1: Constrain new workflow definitions to a sequential route
**Files:**
- Add: `pk-dts-backend/src/api/v1/workflow-definitions/sequential-workflow.validator.ts`
- Add: `pk-dts-backend/src/api/v1/workflow-definitions/sequential-workflow.validator.spec.ts`
- Modify: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-definitions.controller.ts`
- Add: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-definitions.controller.spec.ts`
- Modify: `pk-dts-backend/src/api/v1/workflow-definitions/dto/create-workflow-version.dto.ts`

- [x] Add tests for valid sequential routes and invalid permission assignment, branching, conditions, and invalid start order.
- [x] Add sequential validation with a 1-15 approval-step limit.
- [x] Allow only USER, ROLE, REQUESTER_LEADER assignment modes for new writes.
- [x] Require exactly one APPROVE path to the next ordered step/final outcome.
- [x] Apply sequential validation to create, create-version, update-draft, and publish API paths.
- [x] Require a graph explicitly when creating a new version so an unsafe legacy graph is not cloned implicitly.
- [x] Preserve the generic internal validator/runtime for already-published legacy compatibility.
- [ ] Execute Jest verification in a runnable checkout.

### Task 2: Preserve runtime behavior and add decision authorization gates
**Files:**
- Keep legacy runtime compatibility in: `pk-dts-backend/src/api/v1/documents/documents.service.ts`
- Modify: `pk-dts-backend/src/api/v1/documents/documents.controller.ts`
- Modify test: `pk-dts-backend/src/api/v1/documents/documents.controller.spec.ts`

- [x] Reuse the existing graph-to-runtime-step adapter for linear routes instead of rewriting the 200KB document service.
- [x] Preserve existing stored legacy targets for in-progress historical workflows.
- [x] Keep service-level current-step assignee enforcement and self-approval prevention.
- [x] Require an approval capability at the Approve API boundary in addition to current-step assignment.
- [x] Require `document-requests.reject` for Reject.
- [x] Require `document-requests.request-revision` for Request Revision.
- [x] Add metadata regression tests for those endpoint permission requirements.
- [ ] Execute controller/runtime Jest verification in a runnable checkout.

### Task 3: Simplify the Angular Workflow Builder
**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.types.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.html`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.service.ts`

- [x] Make the editable assignment type USER / ROLE / REQUESTER_LEADER only.
- [x] Stop loading permissions as approver choices.
- [x] Remove routing/condition/default-path controls from the UI.
- [x] Implement ordered approval cards with drag/drop and Move Up / Move Down.
- [x] Keep add/remove step controls.
- [x] Keep Draft / Published / Archived version controls and active/inactive definitions.
- [x] Serialize new edits as a linear schema-v2 compatibility graph with APPROVE-only edges.
- [x] Show fixed system behavior for Approve, Reject, and Request Revision.
- [x] Detect complex legacy graphs and preserve them read-only rather than converting them lossily.
- [x] Convert legacy permission assignment only when mapping is unambiguous; otherwise preserve read-only.
- [ ] Execute Angular production build in a runnable checkout.

### Task 4: Compatibility and safety audit
- [x] Keep database columns used by historical workflow snapshots/runtime records.
- [x] Avoid a database reset or destructive workflow migration.
- [x] Keep schema-v2 graph types internally for historical compatibility only.
- [x] Keep legacy edge/condition/permission types readable where historical versions require them.
- [x] Prevent new permission-based assignee selection at both frontend and backend write boundaries.
- [x] Preserve role IDs when old roles are consolidated through existing seed migration behavior.
- [x] Keep role-name authorization out of the new workflow-builder decision path.
- [ ] Run final repository-wide search/build verification after checkout.

### Task 5: Verification on the runnable Docker checkout
- [ ] Backend: `npm test -- sequential-workflow.validator.spec.ts workflow-definitions.controller.spec.ts documents.controller.spec.ts workflow-definitions.service.spec.ts documents.service.spec.ts`
- [ ] Backend: `npm run build`
- [ ] Frontend: `npm run build`
- [ ] Docker: `docker compose up -d --build`
- [ ] Smoke-test: create draft -> reorder steps -> save -> publish -> submit request -> approve sequentially -> reject path -> request revision/resubmit -> inspect an old published workflow.
- [ ] Confirm new Workflow Builder contains no editable branching, conditions, start-node routing, DEFAULT paths, or permission-based assignee selection.
