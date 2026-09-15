# Role-Aware Navigation and Route Access Design

## Goal
Make PK-DTS show each signed-in user only the workspaces and tasks relevant to their permissions and job, while keeping backend permissions authoritative.

## Core rules
- Roles remain the five fixed system roles: Admin, Internal Audit, Documentation Officer, Staff, Plant Manager.
- Roles provide default permission bundles; normal frontend authorization is permission-driven, not `role === ...` checks.
- Sidebar visibility, Angular route access, and default landing-page selection use the same shared permission definitions.
- Hiding a sidebar link is UX only. Route guards and backend permission checks remain required.
- Workspace-entry permissions are separate from action permissions: a create/edit/delete/publish permission alone does not expose a page whose read/list operation the user cannot perform.
- Page-level buttons remain permission-driven independently from route access.
- Admin may have technical access to personal/requester routes but those shortcuts should not clutter the Admin sidebar.

## Navigation model
Use a shared frontend configuration that defines each navigable workspace once:
- key
- label
- icon
- route
- category
- workspace-entry permissions (ANY semantics)
- optional notification key
- optional sidebar presentation rule such as `hideForRoles: ['Admin']`

The shared helpers answer:
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
Dashboard; Softcopy Documents; Hardcopy Documents; Softcopy Folders; My Document Requests; My Access Requests; My Disposal Requests; My Profile. No Administration/System menu from the default permission bundle.

### Plant Manager
Dashboard; Softcopy/Hardcopy Documents; My Work; Approval Requests; Access Request Review and other task workspaces only when permissions allow them. No Administration/System menu unless permissions are deliberately granted.

### Documentation Officer
Dashboard; document workspaces; My Work; Approval Requests; Access Request Review; document-control task pages allowed by permissions. No general system-administration pages unless permissions are deliberately granted.

### Internal Audit
Dashboard; read-only document workspaces/folders allowed by permissions; Audit & Activity Logs. No create/edit/administration shortcuts.

### Admin
Dashboard; document-control/reviewer tasks; Administration; System. Personal requester shortcuts remain technically accessible when permitted but are hidden from the default Admin sidebar to reduce clutter.

## Route design
- `/panel/dashboard`: dashboard workspace view permission.
- `/panel/softcopy-documents`, `/panel/hardcopy-documents`: document/request view permissions.
- `/panel/softcopy-folders`: focused SoftcopyFoldersPage; requires folder view/manage workspace permission. Create/edit/delete remain button/action permissions.
- `/panel/storage`: storage/classification or location view/manage workspace permissions only. Folder-only permission does not grant this route.
- `/panel/my-document-requests`: own-request view permission. Create/edit/submit remain actions.
- `/panel/my-access-requests`: catalog or own-request view permission and opens DocumentAccessRequests in requester mode. Create/cancel remain actions.
- `/panel/access-review`: access-review permission and opens DocumentAccessRequests in reviewer mode. Approve/reject/grant remain actions.
- `/panel/document-access-requests`: compatibility all-mode route; not shown in the new sidebar.
- `/panel/my-disposal-requests`: disposal-request permission.
- `/panel/approval-review`: document review workspace permission; approval decisions still require their action/stage permissions and workflow assignment.
- `/panel/my-profile`: focused authenticated-user MyProfilePage. It loads only `/users/me`; role and leader are displayed read-only.
- `/panel/users`: user view/manage/registration-review workspace permissions and uses the existing UserAccount management page.
- Administration/System routes keep their specific view/manage permissions.

## Focused workspaces
### DocumentAccessRequestsPage
Read route data `mode`:
- `requester`: show Find Documents/My Requests only and never load the reviewer queue.
- `reviewer`: show Approval Queue only and never load requester/catalog work.
- `all`: compatibility behavior.

### MyProfilePage
A small dedicated self-service page:
- reads only the signed-in user's account;
- allows edits to personal account fields;
- displays role and reporting leader as read-only information;
- does not load the user-management list or registration queue.

Backend self-service update protection strips both `role_id` and `leader_id` for users without account-management permission, so direct API calls cannot change workflow identity/assignment fields.

### SoftcopyFoldersPage
A small dedicated folder workspace:
- lists only softcopy folders;
- shows Create/Edit/Delete actions only when the matching folder permissions exist;
- does not expose storage-classification, asset, sequence, or location administration concepts;
- uses existing softcopy-category APIs and ownership rules.

The larger UserAccountPage and StorageClassificationPage remain focused on administration rather than being overloaded with ordinary-user modes.

## Security
- No sidebar-only authorization.
- No new role-name authorization bypasses.
- Direct URL access fails through the Angular guard when workspace-entry permissions are absent.
- Page actions remain independently permission-gated.
- Backend remains the final source of truth.
- Self-service profile updates cannot change role or leader assignment without account-management permission.

## Testing
Focused tests cover:
- Staff default permissions do not expose admin/system workspaces.
- Plant Manager and Documentation Officer see reviewer tasks without admin/system workspaces.
- Internal Audit stays read-only/audit focused.
- Admin sidebar hides personal requester shortcuts while access helpers may still authorize them.
- action-only permissions do not expose workspaces.
- `firstAuthorizedPanelUrl` chooses from the same navigation registry.
- Approval Review has a non-empty workspace permission requirement.
- My Profile loads only the signed-in account and does not expose editable role/leader fields.
- Softcopy Folders loads only folder data and does not expose storage-admin concepts.
- backend self-service updates strip role and leader assignment.

Frontend/backend build and full test execution remain mandatory before merge.
