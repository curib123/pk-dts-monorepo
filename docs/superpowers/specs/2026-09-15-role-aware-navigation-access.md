# Role-Aware Navigation and Route Access Design

## Goal
Make PK-DTS show each signed-in user only the workspaces and tasks that are relevant to their permissions and job, while keeping backend permissions authoritative.

## Core rules
- Roles remain the five fixed system roles: Admin, Internal Audit, Documentation Officer, Staff, Plant Manager.
- Roles provide default permission bundles; normal frontend authorization is permission-driven, not `role === ...` checks.
- Sidebar visibility, Angular route access, and default landing-page selection must use the same shared permission definitions.
- Hiding a sidebar link is UX only. Route guards and backend permission checks remain required.
- Page-level buttons remain permission-driven independently from route access.
- Admin may have technical access to personal/requester routes but those shortcuts should not clutter the Admin sidebar.

## Navigation model
Use a shared frontend configuration that defines each navigable workspace once:
- key
- label
- icon
- route
- category
- required permissions (ANY semantics)
- optional notification key
- optional sidebar presentation rule such as `hideForRoles: ['Admin']`

The shared helpers must answer:
- whether a user can access an item from permissions;
- whether the item should appear in the sidebar;
- the first authorized panel URL.

## Sidebar groups
### Primary
- Dashboard

### Documents
- Softcopy Documents
- Hardcopy Documents
- Softcopy Folders

### My Work
- My Document Requests
- My Access Requests
- My Disposal Requests
- My Profile

### Tasks
- Approval Requests
- Access Request Review
- Document Disposal / Disposal Review where the role has disposal-review permissions

### Administration
- Storage & Classification
- User Management
- Roles & Permissions
- Workflow Builder

### System
- Audit & Activity Logs
- Backup, Restore & Reset
- System Settings

Empty groups are hidden.

## Expected default role experience
### Staff
Dashboard; Softcopy Documents; Hardcopy Documents; Softcopy Folders; My Document Requests; My Access Requests; My Disposal Requests; My Profile. Approval Requests may appear when the account has an approval permission/assignment.

### Plant Manager
Dashboard; Softcopy/Hardcopy Documents; My Work; Approval Requests; Access Request Review and other task workspaces only when permissions allow them. No Administration/System menu unless permissions are deliberately granted.

### Documentation Officer
Dashboard; document workspaces; My Work; Approval Requests; Access Request Review; document-control task pages allowed by permissions. No general system-administration pages unless permissions are deliberately granted.

### Internal Audit
Dashboard; read-only document workspaces/folders allowed by permissions; Audit & Activity Logs. No create/edit/administration shortcuts.

### Admin
Dashboard; document-control/reviewer tasks; Administration; System. Personal requester shortcuts remain technically accessible when permitted but are hidden from the default Admin sidebar to reduce clutter.

## Route design
- `/panel/dashboard`: `dashboard.view`.
- `/panel/softcopy-documents`, `/panel/hardcopy-documents`: existing document view permissions.
- `/panel/softcopy-folders`: folder permissions only and opens the StorageClassification page in folder-only mode.
- `/panel/storage`: storage/location administration permissions only; folder-only permission must not grant this route.
- `/panel/my-document-requests`: own-request permissions.
- `/panel/my-access-requests`: requester/catalog access permissions and opens DocumentAccessRequests in requester mode.
- `/panel/access-review`: review/approve/reject/grant/revoke/expire permissions and opens DocumentAccessRequests in reviewer mode.
- `/panel/document-access-requests`: compatibility route using all-mode; not shown in the new sidebar.
- `/panel/my-disposal-requests`: disposal request permission.
- `/panel/approval-review`: document review/approval permissions; no empty guard.
- `/panel/my-profile`: authenticated-user profile mode; no user-management list.
- `/panel/users`: user-management permissions only and opens UserAccount in management mode.
- Administration/System routes keep their existing specific permissions.

## Reused page modes
### DocumentAccessRequestsPage
Read route data `mode`:
- `requester`: show Find Documents/My Requests only.
- `reviewer`: show Approval Queue only.
- `all`: compatibility behavior.

Do not duplicate the component.

### UserAccountPage
Read route data `mode`:
- `profile`: show only the current-session profile card/edit-self action; do not load user lists/registration queues.
- `manage`: existing account-management workspace.

### StorageClassificationPage
Read route data `folderOnly`:
- true: expose only `softcopyCategories` and never storage/location tabs.
- false: expose storage/location resources according to permissions; softcopy folders may remain available to admins that also have folder permissions.

## Contextual task visibility
Approval Requests may appear when the user has an approval/review permission. Existing notification-count fallback may also keep the item visible when there is assigned work. Route access must still be enforced by the guard/service.

## Security
- No sidebar-only authorization.
- No new role-name authorization bypasses.
- Direct URL access must fail through Angular guard when required permissions are absent.
- Backend remains the final source of truth.

## Testing
Add focused frontend unit tests for the shared navigation helpers:
- Staff default permissions do not expose admin/system workspaces.
- Internal Audit does not expose mutable/admin workspaces.
- Admin sidebar hides personal requester shortcuts while access helpers can still authorize them.
- `firstAuthorizedPanelUrl` chooses the first accessible route from the shared registry.
- Approval Review has non-empty permission requirements.

Also verify route metadata and build the frontend.