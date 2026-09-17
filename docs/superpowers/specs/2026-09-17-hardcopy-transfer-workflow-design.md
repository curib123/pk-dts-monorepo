# Hardcopy Transfer Workflow Design

**Date:** 2026-09-17

## Goal

Implement hardcopy document transfer requests as a sequential, Workflow Builder-backed process:

`Requester → Plant Manager → Documentation Officer → Final Approver → Requester physical transfer and completion`

The existing document-request approval workflows and document storage rules remain unchanged.

## Current gap

The repository has hardcopy-transfer API endpoints and permissions, but transfer requests currently store one approver and do not use the persisted Workflow Builder graph. The frontend has no transfer request/review route. The seeded hardcopy workflow is a direct approval route for document requests, not a physical-transfer workflow.

## Design

### Workflow definition

- Add a system workflow key `system-hardcopy-transfer` with document type `HARDCOPY`.
- Seed and publish version 1 only when the definition is first created, preserving later Builder edits and versions.
- The default graph has three approval nodes and one requester completion end node:
  - Plant Manager: role assignment to the fixed Plant Manager role.
  - Documentation Officer: role assignment to the fixed Documentation Officer role.
  - Final Approver: configurable role or named-user assignment in Workflow Builder, defaulting to the Documentation Officer role for compatibility with the existing hardcopy approver configuration.
- Extend Builder labels and loading so this workflow is clearly identified as `Hardcopy Transfer Approval`, while existing softcopy/hardcopy document workflows continue to use their current keys.

### Transfer persistence and execution

- Add a transfer workflow version reference and immutable graph snapshot to each request at creation/submission time.
- Add transfer workflow steps with sequence, node key, stage label, assignee, assignment source, decision, remarks, timestamps, and pending/queued/completed status. Add step history for reassignment/decisions where the existing audit model does not cover the transfer.
- Resolve assignments from the published Builder graph at submission. A missing Plant Manager, Documentation Officer, or final approver is a blocking configuration error; never silently select an unrelated user.
- Only the currently pending assigned user may approve, return, or reject a stage. A stage approval queues the next step. A return-for-revision requires remarks, records who returned it and why, and sends the request back to the requester for correction/resubmission.
- Keep physical-transfer states separate from approval states. After the final approver approves, the request becomes `ForTransfer` and is assigned to the requester. The requester marks the physical move complete with required confirmation remarks; only then are the hardcopy storage fields updated and the request marked `Completed`.
- Existing dispatch/recipient endpoints must not allow bypassing the configured approval route or completing a transfer on behalf of the requester, except for the established administrative override policy where explicitly applicable.

### API and authorization

- Keep `/api/v1/hardcopy-transfers` as the resource.
- Add endpoints for the requester’s transfer list, assigned approval queue, stage decision, resubmission, and requester completion. Existing endpoint names may be retained as compatibility wrappers only when they enforce the new current-step rules.
- Use the existing hardcopy-transfer permissions plus stage assignment checks. Do not grant Staff reviewer permissions merely to make the queue visible.
- Include workflow steps and audit history in request detail responses so internal audit can see the current owner, every decision, remarks, and timestamps.

### Frontend

- Add a `Hardcopy Transfer Requests` requester page and a `Hardcopy Transfer Review` queue/detail view using the existing SaaS panel layout.
- Add a transfer request action from the hardcopy document workspace without changing document create/edit behavior.
- Display the workflow timeline and current assignee. Show decision remarks only in the decision modal; do not duplicate them in cards or tables.
- Provide separate actions for Approve, Return for Revision, Reject, and Complete Physical Transfer. Return always opens the remarks modal and requires a nonblank reason.
- Hide review actions unless the logged-in user is the current assigned step; hide completion unless the requester owns the `ForTransfer` task.

## Data flow

1. Requester creates a Draft transfer with destination and reason.
2. Requester submits; the published `system-hardcopy-transfer` version is snapshotted and steps are resolved.
3. Plant Manager approves; Documentation Officer becomes pending.
4. Documentation Officer approves; the configured final approver becomes pending.
5. Final Approver approves; requester receives the physical-transfer task.
6. Requester completes the move and confirms; storage location and audit records update atomically.
7. Any reviewer may return for revision with remarks; the requester corrects and resubmits from the first workflow step.

## Error handling and safety

- Reject requests that have no published transfer workflow, invalid graph, unresolved required assignee, stale workflow step, wrong actor, missing return remarks, inactive destination, or already-completed status.
- Keep each decision, return reason, completion remark, actor, previous status, new status, and timestamp in audit history.
- Preserve existing transfer records during migration. Legacy single-approver records are treated as compatibility records and cannot be silently rewritten into a new route.

## Verification

- Backend unit tests: default version lookup, graph assignment resolution, sequential stage authorization, return/resubmit, final-approval requester handoff, requester-only completion, atomic location update, and legacy compatibility.
- Controller tests: permission decorators and endpoint payloads.
- Frontend tests/build: transfer route visibility, requester/reviewer action visibility, required-remarks modal, and status timeline.
- Run focused backend tests, frontend tests/build, and inspect migration/schema generation before declaring completion.
