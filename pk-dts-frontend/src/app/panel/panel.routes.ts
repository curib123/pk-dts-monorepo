import { Routes } from '@angular/router';
import { PANEL_ROUTE_PERMISSIONS } from './panel-access.config';
import { DocumentsPage } from './pages/documents/documents.page';
import { PanelLayoutComponent } from './panel-layout.component';
import { RolesPermissionsPage } from './pages/roles-permissions/roles-permissions.page';
import { StorageClassificationPage } from './pages/storage-classification/storage-classification.page';
import { UserAccountPage } from './pages/user-account/user-account.page';
import { DocumentDisposalPage } from './pages/document-disposal/document-disposal.page';
import { BackupRestorePage } from './pages/backup-restore/backup-restore.page';
import { DashboardPage } from './pages/dashboard/dashboard.page';
import { DocumentRequestsPage } from './pages/document-requests/document-requests.page';
import { ApprovalReviewPage } from './pages/approval-review/approval-review.page';
import { SystemSettingsPage } from './pages/system-settings/system-settings.page';
import { AuditLogsPage } from './pages/audit-logs/audit-logs.page';
import { DocumentAccessRequestsPage } from './pages/document-access-requests/document-access-requests.page';
import { WorkflowBuilderPage } from './pages/workflow-builder/workflow-builder.page';
import { MyDisposalRequestsPage } from './pages/my-disposal-requests/my-disposal-requests.page';
import { MyProfilePage } from './pages/my-profile/my-profile.page';
import { SoftcopyFoldersPage } from './pages/softcopy-folders/softcopy-folders.page';

export const panelRoutes: Routes = [
    {
        path: '',
        component: PanelLayoutComponent,
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
            { path: 'dashboard', component: DashboardPage, data: { title: 'Dashboard', subtitle: 'Track the system summary, recent activity, and key counts at a glance.', permissions: PANEL_ROUTE_PERMISSIONS.dashboard } },
            { path: 'documents', component: DocumentsPage, data: { title: 'Document', subtitle: 'Manage document records, revisions, request states, and catalog mappings here.', permissions: PANEL_ROUTE_PERMISSIONS.documents } },
            { path: 'softcopy-documents', component: DocumentsPage, data: { documentType: 'SOFTCOPY', title: 'Softcopy Documents', subtitle: 'Browse digital documents by folder, table list, or card grid.', permissions: PANEL_ROUTE_PERMISSIONS.documents } },
            { path: 'hardcopy-documents', component: DocumentsPage, data: { documentType: 'HARDCOPY', title: 'Hardcopy Documents', subtitle: 'Browse physical records by area, location, asset number, table list, or card grid.', permissions: PANEL_ROUTE_PERMISSIONS.documents } },
            { path: 'softcopy-folders', component: SoftcopyFoldersPage, data: { title: 'Softcopy Folders', subtitle: 'Browse and manage only the softcopy folder hierarchy available to your account.', permissions: PANEL_ROUTE_PERMISSIONS.softcopyFolders } },
            { path: 'my-document-requests', component: DocumentRequestsPage, data: { title: 'My Document Requests', subtitle: 'Create and track only the document requests submitted by your account.', permissions: PANEL_ROUTE_PERMISSIONS.myDocumentRequests } },
            { path: 'my-requests', pathMatch: 'full', redirectTo: 'my-document-requests' },
            { path: 'my-access-requests', component: DocumentAccessRequestsPage, data: { mode: 'requester', title: 'My Access Requests', subtitle: 'Find controlled documents and track only your own access requests.', permissions: PANEL_ROUTE_PERMISSIONS.myAccessRequests } },
            { path: 'access-review', component: DocumentAccessRequestsPage, data: { mode: 'reviewer', title: 'Access Request Review', subtitle: 'Review and process document access requests assigned to authorized reviewers.', permissions: PANEL_ROUTE_PERMISSIONS.accessReview } },
            { path: 'document-access-requests', component: DocumentAccessRequestsPage, data: { mode: 'all', title: 'Document Access Requests', subtitle: 'Request document assignments and review pending access approvals.', permissions: PANEL_ROUTE_PERMISSIONS.allAccessRequests } },
            { path: 'my-disposal-requests', component: MyDisposalRequestsPage, data: { title: 'My Disposal Requests', subtitle: 'Track only the document disposal requests submitted by your account.', permissions: PANEL_ROUTE_PERMISSIONS.myDisposalRequests } },
            { path: 'approval-review', component: ApprovalReviewPage, data: { title: 'Approval Requests', subtitle: 'Review document requests assigned to your workflow approval stage.', permissions: PANEL_ROUTE_PERMISSIONS.approvalReview, allowAssignedWorkflowTask: true } },
            { path: 'disposal', component: DocumentDisposalPage, data: { title: 'Document Disposal', subtitle: 'Review disposed documents, disposal requests, remarks, and restore records when permitted.', permissions: PANEL_ROUTE_PERMISSIONS.disposalWorkspace } },
            {
                path: 'storage',
                component: StorageClassificationPage,
                data: {
                    title: 'Storage and Classification',
                    subtitle: 'Manage storage locations, filing structure, and classification catalogs.',
                    permissions: PANEL_ROUTE_PERMISSIONS.storageAdmin
                }
            },
            { path: 'classification', pathMatch: 'full', redirectTo: 'storage' },
            { path: 'my-profile', component: MyProfilePage, data: { title: 'My Profile', subtitle: 'Review and update only your own account details.' } },
            { path: 'users', component: UserAccountPage, data: { title: 'User Management', subtitle: 'Manage user accounts, roles, registrations, and document assignments when permitted.', permissions: PANEL_ROUTE_PERMISSIONS.userManagement } },
            { path: 'roles-permissions', component: RolesPermissionsPage, data: { title: 'Roles and Permissions', subtitle: 'Manage the permission matrix for the five fixed system roles.', permissions: PANEL_ROUTE_PERMISSIONS.rolesPermissions } },
            { path: 'workflow-builder', component: WorkflowBuilderPage, data: { title: 'Workflow Builder', subtitle: 'Configure and publish ordered document approval routes.', permissions: PANEL_ROUTE_PERMISSIONS.workflowBuilder } },
            { path: 'backup-restore', component: BackupRestorePage, data: { title: 'Backup, Restore and Reset', subtitle: 'Create snapshots, restore history, and run guarded factory reset actions.', permissions: PANEL_ROUTE_PERMISSIONS.backupRestore } },
            { path: 'audit-logs', component: AuditLogsPage, data: { title: 'Audit and Activity Logs', subtitle: 'Trace authenticated document and system actions.', permissions: PANEL_ROUTE_PERMISSIONS.auditLogs } },
            { path: 'settings', component: SystemSettingsPage, data: { title: 'System Settings', subtitle: 'Manage device branding, document behavior, and protected system presentation settings.', permissions: PANEL_ROUTE_PERMISSIONS.systemSettings } }
        ]
    }
];
