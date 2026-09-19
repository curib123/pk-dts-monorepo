import { Routes } from '@angular/router';
import { PANEL_ROUTE_PERMISSIONS } from './panel-access.config';
import { PanelLayoutComponent } from './panel-layout.component';

export const panelRoutes: Routes = [
    {
        path: '',
        component: PanelLayoutComponent,
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
            { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage), data: { title: 'Dashboard', subtitle: 'Track the system summary, recent activity, and key counts at a glance.', permissions: PANEL_ROUTE_PERMISSIONS.dashboard } },
            { path: 'documents', loadComponent: () => import('./pages/documents/documents.page').then((m) => m.DocumentsPage), data: { title: 'Document', subtitle: 'Manage document records, revisions, request states, and catalog mappings here.', permissions: PANEL_ROUTE_PERMISSIONS.documents } },
            { path: 'softcopy-documents', loadComponent: () => import('./pages/documents/documents.page').then((m) => m.DocumentsPage), data: { documentType: 'SOFTCOPY', title: 'Softcopy Documents', subtitle: 'Browse digital documents by folder, table list, or card grid.', permissions: PANEL_ROUTE_PERMISSIONS.documents } },
            { path: 'hardcopy-documents', loadComponent: () => import('./pages/documents/documents.page').then((m) => m.DocumentsPage), data: { documentType: 'HARDCOPY', title: 'Hardcopy Documents', subtitle: 'Browse physical records by area, location, asset number, table list, or card grid.', permissions: PANEL_ROUTE_PERMISSIONS.documents } },
            { path: 'softcopy-folders', loadComponent: () => import('./pages/softcopy-folders/softcopy-folders.page').then((m) => m.SoftcopyFoldersPage), data: { title: 'Softcopy Folders', subtitle: 'Browse and manage only the softcopy folder hierarchy available to your account.', permissions: PANEL_ROUTE_PERMISSIONS.softcopyFolders } },
            { path: 'my-document-requests', loadComponent: () => import('./pages/document-requests/document-requests.page').then((m) => m.DocumentRequestsPage), data: { title: 'My Document Requests', subtitle: 'Create and track only the document requests submitted by your account.', permissions: PANEL_ROUTE_PERMISSIONS.myDocumentRequests } },
            { path: 'my-requests', pathMatch: 'full', redirectTo: 'my-document-requests' },
            { path: 'my-access-requests', loadComponent: () => import('./pages/document-access-requests/document-access-requests.page').then((m) => m.DocumentAccessRequestsPage), data: { mode: 'requester', title: 'My Access Requests', subtitle: 'Find controlled documents and track only your own access requests.', permissions: PANEL_ROUTE_PERMISSIONS.myAccessRequests } },
            { path: 'access-review', loadComponent: () => import('./pages/document-access-requests/document-access-requests.page').then((m) => m.DocumentAccessRequestsPage), data: { mode: 'reviewer', title: 'Access Request Review', subtitle: 'Review and process document access requests assigned to authorized reviewers.', permissions: PANEL_ROUTE_PERMISSIONS.accessReview } },
            { path: 'document-access-requests', loadComponent: () => import('./pages/document-access-requests/document-access-requests.page').then((m) => m.DocumentAccessRequestsPage), data: { mode: 'all', title: 'Document Access Requests', subtitle: 'Request document assignments and review pending access approvals.', permissions: PANEL_ROUTE_PERMISSIONS.allAccessRequests } },
            { path: 'my-disposal-requests', loadComponent: () => import('./pages/my-disposal-requests/my-disposal-requests.page').then((m) => m.MyDisposalRequestsPage), data: { title: 'My Disposal Requests', subtitle: 'Track only the document disposal requests submitted by your account.', permissions: PANEL_ROUTE_PERMISSIONS.myDisposalRequests } },
            { path: 'hardcopy-transfers', loadComponent: () => import('./pages/hardcopy-transfers/hardcopy-transfers.page').then((m) => m.HardcopyTransfersPage), data: { mode: 'requester', title: 'Hardcopy Transfer Requests', subtitle: 'Request and confirm physical hardcopy document transfers.', permissions: PANEL_ROUTE_PERMISSIONS.hardcopyTransfers } },
            { path: 'hardcopy-transfer-review', loadComponent: () => import('./pages/hardcopy-transfers/hardcopy-transfers.page').then((m) => m.HardcopyTransfersPage), data: { mode: 'reviewer', title: 'Hardcopy Transfer Review', subtitle: 'Review hardcopy transfer stages assigned to your account.', permissions: PANEL_ROUTE_PERMISSIONS.hardcopyTransferReview } },
            { path: 'approval-review', loadComponent: () => import('./pages/approval-review/approval-review.page').then((m) => m.ApprovalReviewPage), data: { title: 'Approval Requests', subtitle: 'Review document requests assigned to your workflow approval stage.', permissions: PANEL_ROUTE_PERMISSIONS.approvalReview, allowAssignedWorkflowTask: true } },
            { path: 'disposal', loadComponent: () => import('./pages/document-disposal/document-disposal.page').then((m) => m.DocumentDisposalPage), data: { title: 'Document Disposal', subtitle: 'Review disposed documents, disposal requests, remarks, and restore records when permitted.', permissions: PANEL_ROUTE_PERMISSIONS.disposalWorkspace } },
            {
                path: 'storage',
                loadComponent: () => import('./pages/storage-classification/storage-classification.page').then((m) => m.StorageClassificationPage),
                data: {
                    title: 'Storage and Classification',
                    subtitle: 'Manage storage locations, filing structure, and classification catalogs.',
                    permissions: PANEL_ROUTE_PERMISSIONS.storageAdmin
                }
            },
            { path: 'classification', pathMatch: 'full', redirectTo: 'storage' },
            { path: 'my-profile', loadComponent: () => import('./pages/my-profile/my-profile.page').then((m) => m.MyProfilePage), data: { title: 'My Profile', subtitle: 'Review and update only your own account details.' } },
            { path: 'users', loadComponent: () => import('./pages/user-account/user-account.page').then((m) => m.UserAccountPage), data: { title: 'User Management', subtitle: 'Manage user accounts, roles, registrations, and document assignments when permitted.', permissions: PANEL_ROUTE_PERMISSIONS.userManagement } },
            { path: 'roles-permissions', loadComponent: () => import('./pages/roles-permissions/roles-permissions.page').then((m) => m.RolesPermissionsPage), data: { title: 'Roles and Permissions', subtitle: 'Manage the permission matrix for the five fixed system roles.', permissions: PANEL_ROUTE_PERMISSIONS.rolesPermissions } },
            { path: 'workflow-builder', loadComponent: () => import('./pages/workflow-builder/workflow-builder.page').then((m) => m.WorkflowBuilderPage), data: { title: 'Workflow Builder', subtitle: 'Configure and publish ordered document approval routes.', permissions: PANEL_ROUTE_PERMISSIONS.workflowBuilder } },
            { path: 'backup-restore', loadComponent: () => import('./pages/backup-restore/backup-restore.page').then((m) => m.BackupRestorePage), data: { eyebrow: 'System administration', icon: 'pi pi-database', title: 'Backup, Restore and Reset', subtitle: 'Create snapshots, restore history, and run guarded reset actions.', permissions: PANEL_ROUTE_PERMISSIONS.backupRestore } },
            { path: 'audit-logs', loadComponent: () => import('./pages/audit-logs/audit-logs.page').then((m) => m.AuditLogsPage), data: { eyebrow: 'System administration', icon: 'pi pi-shield', title: 'Audit and Activity Logs', subtitle: 'Trace authenticated document and system actions without loading unnecessary record payloads.', permissions: PANEL_ROUTE_PERMISSIONS.auditLogs } },
            { path: 'settings', loadComponent: () => import('./pages/system-settings/system-settings.page').then((m) => m.SystemSettingsPage), data: { title: 'System Settings', subtitle: 'Manage device branding, document behavior, and protected system presentation settings.', permissions: PANEL_ROUTE_PERMISSIONS.systemSettings } }
        ]
    }
];
