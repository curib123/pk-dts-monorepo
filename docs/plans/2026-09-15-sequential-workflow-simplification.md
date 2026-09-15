# Sequential Workflow Simplification Plan

## Goal

Replace the administrator-facing generic workflow graph designer with a simple versioned sequential approval-route builder while preserving historical workflow versions, in-progress request snapshots, audit history, and the existing runtime compatibility path.

## Design

New workflow-builder writes are limited to one ordered approval chain:

1. One to fifteen approval steps.
2. Each step is assigned to the requester's leader, a specific user, or a role.
3. Approve advances to the next step; the final approval reaches the Approved outcome.
4. Reject and request-revision behavior remain fixed application behavior rather than configurable graph paths.
5. Conditional routing, branching, DEFAULT paths, arbitrary start nodes, and permission-based assignee selection are not available to new builder writes.

The existing `WorkflowVersion.graph` JSON and runtime graph executor remain as a private compatibility layer for already-published versions and in-progress snapshots. This avoids destructive migrations and preserves audit history. New versions created from the UI are serialized as a strict linear v2 graph until the runtime can be decomposed safely from the large documents service.

## Safety

- Published versions remain immutable.
- Existing requests remain bound to their original workflow version/snapshot.
- Complex legacy graph versions are detected in the UI and kept read-only rather than being converted automatically.
- Known legacy system assignments are mapped safely: Noted By -> Requester's Leader, Plant Manager -> Plant Manager role, Document Controller/Hardcopy Approval -> Documentation Officer role.
- Backend validation rejects new branching, conditions, non-Approve routing, and permission-based approver selection.

## Verification

- Backend validator unit tests cover valid sequential routes, permission-assignee rejection, branching rejection, condition rejection, and invalid start order.
- Backend and frontend production builds must pass before merge.
- Docker Compose should be rebuilt after pulling the branch to verify the deployed PostgreSQL path.
