# Sequential Approval Workflow Design

## Goal
Replace the generic graph/BPM-style Workflow Builder with a versioned sequential approval route that matches PK-DTS document-control needs without risking historical or in-progress requests.

## Core rule
Administrators configure only **who approves and in what order**. The application owns approve/reject/revision behavior, permissions, versioning, audit history, and runtime progression.

## Keep
- Workflow definitions.
- DRAFT / PUBLISHED / ARCHIVED versions.
- Published versions immutable.
- Existing requests remain bound to their original workflow snapshot/version.
- Runtime `DocumentWorkflowStep` records and assignment history.
- Requester leader, specific user, and role assignment modes.
- Backend permission enforcement.
- Existing schema-v2 JSON storage/runtime support for compatibility.

## Remove from the product model for new workflows
- Arbitrary branching.
- Administrator-controlled start-node selection.
- Configurable APPROVE / REJECT / RETURN / DEFAULT destinations.
- Edge conditions and condition operators.
- Permission-based approver discovery.
- Custom graph positioning and graph/cycle concepts in the administrator UI.

## Compatibility storage format
The database and runtime already use the `WorkflowVersion.graph` JSON field and schema version 2. Replacing that storage format would add migration risk without business value, so it remains an internal compatibility wire format.

The new builder writes only a **linear schema-v2 graph**:

```json
{
  "schema_version": 2,
  "start_node_key": "noted-by",
  "nodes": [
    {
      "key": "noted-by",
      "label": "Leader / Noted By",
      "type": "APPROVAL",
      "stage": "NOTED_BY",
      "assignment": { "type": "REQUESTER_LEADER" }
    },
    {
      "key": "plant-manager",
      "label": "Plant Manager Approval",
      "type": "APPROVAL",
      "stage": "PLANT_MANAGER",
      "assignment": { "type": "ROLE", "role_id": "2" }
    },
    {
      "key": "approved",
      "label": "Approved",
      "type": "END"
    }
  ],
  "edges": [
    {
      "key": "noted-by-approve",
      "from": "noted-by",
      "to": "plant-manager",
      "outcome": "APPROVE"
    },
    {
      "key": "plant-manager-approve",
      "from": "plant-manager",
      "to": "approved",
      "outcome": "APPROVE"
    }
  ]
}
```

The graph shape is not exposed as a business concept. It is only the existing persistence/runtime representation of an ordered list.

Supported assignment types for new workflows: `USER`, `ROLE`, `REQUESTER_LEADER`.

## New-workflow validation
New workflow creates, draft updates, new versions, and publication must enforce:
- 1 to 15 approval steps;
- exactly one final Approved outcome;
- the first approval step is the route start;
- exactly one APPROVE connection from every approval step to the next ordered step or final outcome;
- no conditional routing;
- no REJECT / RETURN / DEFAULT connections;
- no `PERMISSION` assignee mode;
- no hidden `required_permission` routing metadata;
- valid referenced users and roles through the existing backend validation.

## Legacy compatibility
- Existing published branching workflows remain readable and executable by the existing runtime.
- Existing in-progress `DocumentWorkflowStep` records retain their stored routing metadata.
- A legacy branching workflow is displayed read-only in the new builder rather than being converted lossily.
- A legacy permission-based assignment is converted only when the mapping is unambiguous; otherwise the version remains read-only.
- Administrators create a new sequential workflow when an old route cannot be converted safely.
- No database reset or destructive migration is permitted.

## Runtime behavior for new sequential workflows
1. Resolve the published workflow version for the document type/action.
2. Convert its ordered approval nodes into the existing runtime workflow plan.
3. Resolve each configured assignment to an actual user when the request begins.
4. Persist ordered runtime steps and user snapshots.
5. Step 1 becomes PENDING; later steps are QUEUED.
6. Approve -> current step APPROVED, next ordered step PENDING; final approval -> document Approved/Cancelled according to the request action.
7. Reject -> current step REJECTED and workflow stops.
8. Request revision -> current step RETURNED, document ForRevision, and active progression stops.
9. Resubmit -> stored runtime steps restart from Step 1.

## Authorization
Responsibility and authorization are separate gates:
- the actor must be the assigned user for the current runtime step; and
- the actor must have an appropriate document-approval capability for Approve;
- Reject requires `document-requests.reject`;
- Request Revision requires `document-requests.request-revision`.

The existing stage-specific approval permissions remain available for legacy compatibility. New sequential routes do not select approvers by permission.

Role names do not grant workflow-decision authorization by themselves.

## UI
The Workflow Builder is an ordered route editor with:
- workflow metadata and version controls;
- ordered approval-step cards;
- add/remove/reorder controls;
- step label;
- requester leader / specific user / role assignment;
- fixed behavior explanation for Approve, Reject, and Request Revision;
- Save Draft / Publish.

Do not expose graph connections, conditions, branching, default paths, start-node selection, or permission-based assignee selection.