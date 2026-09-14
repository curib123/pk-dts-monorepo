# Request Softcopy Before Approval — Design

## Goal
Move the proposed Softcopy file upload into the Document Control Request so CREATE and REVISE requests submit the exact file that approvers review. The proposed file must not become the controlled/current revision until the final approval step succeeds.

## Required behavior
- Softcopy CREATE and REVISE requests show a proposed-file upload in the request form.
- Saving a DCR as DRAFT may omit the file.
- Submitting a Softcopy CREATE or REVISE DCR requires a proposed file.
- The upload is stored immediately as a DocumentRevision candidate with `is_current=false`, `approved_by_user_id=null`, and `approved_at=null`.
- Approval reviewers see the candidate revision in the existing approval detail payload and can open/download the same stored file.
- Intermediate approvals do not make the revision current.
- When the final workflow approval completes the request, the pending candidate revision is marked approved/current and `softcopy.current_revision_id` points to it.
- Rejecting or cancelling a request does not replace the existing controlled/current revision.
- Request Revision leaves the candidate as non-current so the requester can replace/update the proposed revision before resubmission.
- Hardcopy behavior is unchanged.
- Direct Create remains a special authorized path and continues to create a controlled/current revision immediately.
- Scanned/supporting attachments remain separate from the proposed revision file.

## UI copy
Use “Proposed softcopy file” for normal DCR CREATE/REVISE uploads. Explain that approvers review this exact file and it becomes controlled only after final approval.

## Compatibility
Reuse the existing multipart `POST /documents` `file` field, `DocumentRevision` model, revision storage path, and approval detail payload. Avoid schema changes unless existing models cannot express the state.