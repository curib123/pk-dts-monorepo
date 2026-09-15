# Sequential Approval Workflow Design

## Goal
Replace the generic graph/BPM-style workflow builder with a versioned sequential approval route that matches PK-DTS document-control needs.

## Core rule
Administrators configure only **who approves and in what order**. The application owns approve/reject/revision behavior, permissions, versioning, audit history, and runtime progression.

## Keep
- Workflow definitions.
- DRAFT / PUBLISHED / ARCHIVED versions.
- Published versions immutable.
- Existing requests remain bound to their original workflow snapshot/version.
- Runtime DocumentWorkflowStep records and assignment history.
- Requester leader, specific user, and role assignment modes.
- Backend permission enforcement.

## Remove from new workflow definitions
- Arbitrary graph nodes and edges.
- Configurable start node.
- APPROVE / REJECT / RETURN / DEFAULT edge routing.
- Edge conditions and condition operators.
- Permission-based approver discovery.
- Custom graph positions and cycle detection.

## New workflow payload
Keep the existing `graph` JSON column/API field for database/API compatibility, but store schema version 3 as an ordered step list:

```json
{
  "schema_version": 3,
  "steps": [
    {
      "key": "step-1",
      "label": "Noted By",
      "stage": "NOTED_BY",
      "assignment": { "type": "REQUESTER_LEADER" }
    },
    {
      "key": "step-2",
      "label": "Plant Manager Approval",
      "stage": "PLANT_MANAGER",
      "assignment": { "type": "ROLE", "role_id": "2" }
    }
  ]
}
```

Supported assignment types: `USER`, `ROLE`, `REQUESTER_LEADER`.

## Compatibility
- Existing schema-v2 published workflows remain readable and executable through a compatibility adapter.
- Existing in-progress runtime steps retain their stored routing metadata and continue safely.
- New/edited workflows are saved as schema-v3 sequential workflows.
- No database reset is permitted.

## Runtime behavior
1. Resolve the published workflow version for the document type/action.
2. Resolve each configured step to an actual user when the request begins.
3. Persist ordered runtime steps and snapshots.
4. Step 1 becomes PENDING; later steps are QUEUED.
5. Approve -> mark current APPROVED and activate the next sequence; if none remains, approve/cancel the document according to the request action.
6. Reject -> mark current REJECTED and stop the workflow.
7. Request revision -> mark current RETURNED, set document ForRevision, and stop the active progression.
8. Resubmit -> reset the stored runtime steps and restart from step 1.

## Authorization
Approval requires both:
- the actor is the assigned user for the current step; and
- the actor has the required system approval permission when the stage requires one.

Role names do not grant authorization by themselves.

## UI
The Workflow Builder becomes an ordered route editor:
- workflow metadata and version controls;
- ordered approval-step cards;
- add/remove/reorder steps;
- label and assignment source/user/role;
- Save Draft / Publish.

Do not expose graph connections, conditions, branching, default paths, or permission-based assignee selection.