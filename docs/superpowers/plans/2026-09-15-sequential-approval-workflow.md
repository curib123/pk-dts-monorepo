# Sequential Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic workflow graph designer with a safe versioned sequential approval-route builder while preserving existing workflow history and in-progress requests.

**Architecture:** Keep the existing WorkflowDefinition/WorkflowVersion storage and `graph` JSON field for compatibility, but introduce schema version 3 containing ordered approval steps only. Backend normalizes legacy schema-v2 workflows for compatibility; new frontend edits emit schema-v3. Runtime progression becomes sequence-first while honoring stored legacy routing metadata for already-created workflow steps.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Angular, Jest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-15-sequential-approval-workflow.md`

## Global Constraints
- Keep five fixed roles and permission-based authorization.
- Do not add CASL, ABAC, BPM libraries, policy engines, or new workflow dependencies.
- Do not reset or destructively rewrite production data.
- Preserve published-version immutability and in-progress request snapshots.
- New workflow assignment modes are USER, ROLE, REQUESTER_LEADER only.
- Backend remains authoritative for approval authorization.

---

### Task 1: Sequential workflow domain model and validation
**Files:**
- Modify: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-graph.types.ts`
- Modify: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-definitions.service.ts`
- Test: `pk-dts-backend/src/api/v1/workflow-definitions/workflow-definitions.service.spec.ts`

**Interfaces:**
- Produces `SequentialWorkflow` schema version 3 with `steps`.
- Produces backend normalization that accepts legacy v2 and returns a v3-equivalent ordered workflow for editing/runtime use where safe.

- [ ] Write tests proving valid sequential workflows pass and invalid/permission-assignment/duplicate-key workflows fail.
- [ ] Add schema-v3 types and a legacy-v2 compatibility type.
- [ ] Replace graph-cycle/edge-condition validation for new definitions with ordered-step validation (1-15 steps).
- [ ] Preserve read compatibility for v2 workflow versions.
- [ ] Verify workflow-definition Jest tests.

### Task 2: Runtime progression and assignment simplification
**Files:**
- Modify: `pk-dts-backend/src/api/v1/documents/documents.service.ts`
- Test: `pk-dts-backend/src/api/v1/documents/documents.service.spec.ts`

**Interfaces:**
- Consumes schema-v3 ordered steps.
- Keeps legacy v2 conversion for already-published workflows.
- Produces runtime DocumentWorkflowStep records ordered by `sequence`.

- [ ] Write/adjust tests for sequential step initialization, approval-to-next-step, reject stop, revision restart, and invalid permission-based assignment rejection.
- [ ] Add schema-v3 workflow-to-plan conversion.
- [ ] Remove permission-based assignee discovery for new workflows.
- [ ] Make approval progression choose the next queued/pending sequence when no legacy configured target exists.
- [ ] Preserve stored legacy target behavior for existing in-progress v2 runtime steps.
- [ ] Keep assigned-user + permission checks for approval.

### Task 3: Simplified Angular Workflow Builder
**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.types.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.html`
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.service.ts` only if typing requires it.
- Modify: `pk-dts-frontend/src/app/panel/pages/workflow-builder/workflow-builder.page.scss` only for removed/renamed UI selectors if necessary.

**Interfaces:**
- Displays ordered steps only.
- Emits schema-v3 payload in existing API field `graph`.

- [ ] Replace edge/condition/outcome types with sequential step types.
- [ ] Remove condition/routing editing methods and reference-data permission loading.
- [ ] Keep user/role reference loading.
- [ ] Implement add/remove/reorder step operations.
- [ ] Limit assignment choices to specific user, role, requester leader.
- [ ] Keep draft/version/publish/active controls.
- [ ] Ensure old v2 versions are displayed through backend normalization or frontend compatibility conversion without exposing graph controls.

### Task 4: Compatibility and dead-code cleanup
**Files:**
- Modify relevant workflow imports/usages found by repo-wide audit.
- Preserve Prisma columns needed by historical runtime records.

- [ ] Remove unused workflow condition/edge imports from new-code paths.
- [ ] Do not drop existing DB columns used by historical records.
- [ ] Search for `PERMISSION`, `WorkflowCondition`, `WorkflowEdge`, `DEFAULT`, `on_approve_node_key`, and document each remaining legacy-only usage.
- [ ] Confirm no new role-name authorization bypass is introduced.

### Task 5: Verification
- [ ] Backend: `npm test -- workflow-definitions.service.spec.ts documents.service.spec.ts`
- [ ] Backend: `npm run build`
- [ ] Frontend: `npm run build`
- [ ] Docker: `docker compose up -d --build`
- [ ] Smoke-test create draft, publish, submit document, approve sequentially, reject, request revision/resubmit, and view an old workflow version.
- [ ] Final audit confirms new UI contains no graph branching/conditions/permission-assignee controls.
