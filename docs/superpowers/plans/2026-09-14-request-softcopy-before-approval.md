# Request Softcopy Before Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require the proposed Softcopy file at DCR submission time for CREATE and REVISE requests, expose that exact candidate to approvers, and promote it to the current controlled revision only after final approval.

**Architecture:** Reuse the existing multipart `POST /documents` file upload and `DocumentRevision` persistence. A normal DCR upload is stored as a non-current candidate; final workflow approval atomically approves/promotes the latest pending candidate for the request. The Angular request form sends the file for normal CREATE/REVISE DCRs and the approval page uses the existing revision URLs from the detail payload.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest, Angular, PrimeNG, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-14-request-softcopy-before-approval.md`

## Global Constraints
- Hardcopy flow must remain unchanged.
- Direct Create must remain an immediate controlled/current-copy path.
- Normal DCR drafts may omit the proposed file.
- Normal DCR CREATE/REVISE submissions must include the proposed file.
- Supporting scan attachments remain separate from the proposed revision.
- No database schema change unless existing revision/current-pointer fields are insufficient.

---

### Task 1: Backend regression tests for request-time proposal

**Files:**
- Modify: `pk-dts-backend/src/api/v1/documents/documents.service.spec.ts`

**Interfaces:**
- Consumes: `DocumentsService.createRequest()` and `DocumentsService.transition()`.
- Produces: tests defining candidate creation and final promotion behavior.

- [ ] Add a test that submitted Softcopy CREATE/REVISE DCRs without `file` reject with a clear proposed-file requirement while DRAFT remains allowed.
- [ ] Add a test that a normal submitted DCR with `file` creates `DocumentRevision` with `is_current: false`, no approval actor/timestamp, and does not update `current_revision_id`.
- [ ] Add a final-approval transition test asserting the candidate revision becomes current/approved and `softcopy.current_revision_id` is updated.
- [ ] Preserve existing Direct Create expectations.

### Task 2: Backend request persistence and final promotion

**Files:**
- Modify: `pk-dts-backend/src/api/v1/documents/documents.service.ts`
- Modify: `pk-dts-backend/src/api/v1/documents/documents.controller.ts`

**Interfaces:**
- Consumes: existing `file` multipart field, workflow status transition, `DocumentRevision`, `SoftcopyDocument.current_revision_id`.
- Produces: request candidate revision and automatic final promotion.

- [ ] Replace the normal-DCR file rejection with submit-time validation: CREATE/REVISE SUBMIT requires `file`; DRAFT may omit it; cancellation is not forced to upload a new revision.
- [ ] Store normal DCR uploads using the existing revision write path with `is_current=false` and no approval metadata.
- [ ] Ensure returned document detail contains revisions with usable file URLs for approval review.
- [ ] On the final approval transition for Softcopy CREATE/REVISE, find the newest non-historical non-current candidate, mark the prior current revision non-current when present, approve/promote the candidate, and update `current_revision_id` in the same transaction.
- [ ] Do not promote on intermediate approve, reject, cancel, or request-revision.
- [ ] Update Swagger copy so `file` is documented as the proposed Softcopy file for normal requests and controlled file for Direct Create.

### Task 3: Frontend request form and multipart submission

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/components/document-form-dialog/document-form-dialog.component.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/documents.service.ts`
- Modify: `pk-dts-frontend/src/app/panel/pages/documents/documents.types.ts` only if the existing form type cannot already carry `initial_file`.

**Interfaces:**
- Consumes: existing `DocumentFormValue`, `selectInitialFile()`, and create multipart method.
- Produces: proposed file visible for normal CREATE/REVISE DCRs and sent as `file`.

- [ ] Show the upload control for Softcopy create mode when action is CREATE or REVISE, not just Direct Create.
- [ ] Label normal requests “Proposed softcopy file” and explain the exact file is reviewed and only becomes controlled after final approval.
- [ ] Keep Direct Create copy distinct.
- [ ] Require the file in client validation only when submitting a normal CREATE/REVISE request; allow Save Draft without it.
- [ ] Keep scan attachments separate.
- [ ] Ensure the create request multipart payload includes the selected proposed file for normal DCRs.

### Task 4: Approval review visibility

**Files:**
- Modify: `pk-dts-frontend/src/app/panel/pages/approval-review/approval-review.page.ts` if necessary.

**Interfaces:**
- Consumes: `GET /documents/:id/approval-view` revisions and revision URLs.
- Produces: explicit candidate-file review action.

- [ ] Confirm approval view already renders revisions; if not, add a “Proposed softcopy” section showing the newest non-current revision with filename/revision number and view/download action.
- [ ] Do not present the candidate as “Controlled Copy” before final approval.

### Task 5: Verification

**Files:** none unless verification exposes defects.

- [ ] Run backend focused Jest tests for `documents.service.spec.ts` and workflow runtime tests when an execution environment is available.
- [ ] Run backend TypeScript build.
- [ ] Run frontend Angular build/type-check.
- [ ] Compare feature branch against `main` and review only intended files.
- [ ] Check GitHub commit/PR CI status and report any environment limitation explicitly.
