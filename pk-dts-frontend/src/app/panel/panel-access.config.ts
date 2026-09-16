import type { NavigationNotificationCounts } from './pages/dashboard/dashboard.types';

export type PanelRoleName = 'Admin' | 'Internal Audit' | 'Documentation Officer' | 'Staff' | 'Plant Manager' | string;
export type PanelCategoryId = 'documents' | 'my-work' | 'tasks' | 'administration' | 'system';

export interface PanelNavItem {
    key: string;
    label: string;
    icon: string;
    route: string;
    permissions: string[];
    notificationKey?: keyof NavigationNotificationCounts;
    requiresAssignedApproval?: boolean;
    hideForRoles?: string[];
}

export interface PanelNavCategory {
    id: PanelCategoryId;
    label: string;
    icon: string;
    items: PanelNavItem[];
}

export interface PanelAccessContext {
    roleName: PanelRoleName;
    permissions: readonly string[];
    assignedApprovalCount?: number;
}

// Route/sidebar permissions answer only whether the user can enter and read a workspace.
// Create/edit/delete/publish permissions remain page-action permissions and do not by themselves expose a workspace.
const DOCUMENT_VIEW_PERMISSIONS = ['documents.view', 'document-requests.view'];
const SOFTCOPY_FOLDER_PERMISSIONS = ['softcopy-folders.view', 'softcopy-folders.manage'];
const MY_DOCUMENT_REQUEST_PERMISSIONS = ['document-requests.view-own'];
const MY_ACCESS_REQUEST_PERMISSIONS = ['document-access-requests.catalog', 'document-access-requests.view-own'];
const ACCESS_REVIEW_PERMISSIONS = ['document-access-requests.review'];
const APPROVAL_REVIEW_PERMISSIONS = ['document-requests.review'];
const DISPOSAL_WORKSPACE_PERMISSIONS = ['document-disposal.view', 'document-disposal.review', 'document-disposal.manage'];
const STORAGE_ADMIN_PERMISSIONS = [
    'storage-classification.view',
    'storage-classification.manage',
    'location-management.view',
    'location-management.manage'
];
const USER_MANAGEMENT_PERMISSIONS = ['user-accounts.view', 'user-accounts.manage', 'user-accounts.approve'];

function hasPanelPermission(permissions: readonly string[], requiredPermission: string) {
    return permissions.includes(requiredPermission)
        || (requiredPermission.startsWith('documents.') && permissions.includes('documents.manage'));
}

export const PANEL_ROUTE_PERMISSIONS = {
    dashboard: ['dashboard.view'],
    documents: DOCUMENT_VIEW_PERMISSIONS,
    softcopyFolders: SOFTCOPY_FOLDER_PERMISSIONS,
    myDocumentRequests: MY_DOCUMENT_REQUEST_PERMISSIONS,
    myAccessRequests: MY_ACCESS_REQUEST_PERMISSIONS,
    accessReview: ACCESS_REVIEW_PERMISSIONS,
    allAccessRequests: [...MY_ACCESS_REQUEST_PERMISSIONS, ...ACCESS_REVIEW_PERMISSIONS],
    myDisposalRequests: ['document-disposal.request'],
    approvalReview: APPROVAL_REVIEW_PERMISSIONS,
    disposalWorkspace: DISPOSAL_WORKSPACE_PERMISSIONS,
    storageAdmin: STORAGE_ADMIN_PERMISSIONS,
    userManagement: USER_MANAGEMENT_PERMISSIONS,
    rolesPermissions: ['roles-permissions.view', 'roles-permissions.manage'],
    workflowBuilder: ['document-workflow.view', 'document-workflow.configure'],
    backupRestore: ['backup-restore.view'],
    auditLogs: ['activity-logs.view_logs'],
    systemSettings: ['system-settings.manage']
} satisfies Record<string, string[]>;

const hidePersonalFromAdmin = ['Admin'];

export const PANEL_NAVIGATION: { dashboard: PanelNavItem; categories: PanelNavCategory[] } = {
    dashboard: {
        key: 'dashboard',
        label: 'Dashboard',
        icon: 'pi pi-home',
        route: '/panel/dashboard',
        permissions: PANEL_ROUTE_PERMISSIONS.dashboard
    },
    categories: [
        {
            id: 'documents',
            label: 'Documents',
            icon: 'pi pi-folder-open',
            items: [
                {
                    key: 'softcopy-documents',
                    label: 'Softcopy Documents',
                    icon: 'pi pi-file',
                    route: '/panel/softcopy-documents',
                    permissions: PANEL_ROUTE_PERMISSIONS.documents
                },
                {
                    key: 'hardcopy-documents',
                    label: 'Hardcopy Documents',
                    icon: 'pi pi-box',
                    route: '/panel/hardcopy-documents',
                    permissions: PANEL_ROUTE_PERMISSIONS.documents
                },
                {
                    key: 'softcopy-folders',
                    label: 'Softcopy Folders',
                    icon: 'pi pi-folder',
                    route: '/panel/softcopy-folders',
                    permissions: PANEL_ROUTE_PERMISSIONS.softcopyFolders
                }
            ]
        },
        {
            id: 'my-work',
            label: 'My Work',
            icon: 'pi pi-briefcase',
            items: [
                {
                    key: 'my-document-requests',
                    label: 'My Document Requests',
                    icon: 'pi pi-file-edit',
                    route: '/panel/my-document-requests',
                    permissions: PANEL_ROUTE_PERMISSIONS.myDocumentRequests,
                    notificationKey: 'document_requests',
                    hideForRoles: hidePersonalFromAdmin
                },
                {
                    key: 'my-access-requests',
                    label: 'My Access Requests',
                    icon: 'pi pi-key',
                    route: '/panel/my-access-requests',
                    permissions: PANEL_ROUTE_PERMISSIONS.myAccessRequests,
                    hideForRoles: hidePersonalFromAdmin
                },
                {
                    key: 'my-disposal-requests',
                    label: 'My Disposal Requests',
                    icon: 'pi pi-trash',
                    route: '/panel/my-disposal-requests',
                    permissions: PANEL_ROUTE_PERMISSIONS.myDisposalRequests,
                    notificationKey: 'disposal_requests',
                    hideForRoles: hidePersonalFromAdmin
                },
                {
                    key: 'my-profile',
                    label: 'My Profile',
                    icon: 'pi pi-user',
                    route: '/panel/my-profile',
                    permissions: [],
                    hideForRoles: hidePersonalFromAdmin
                }
            ]
        },
        {
            id: 'tasks',
            label: 'Tasks',
            icon: 'pi pi-list-check',
            items: [
                {
                    key: 'approval-review',
                    label: 'Approval Requests',
                    icon: 'pi pi-check-square',
                    route: '/panel/approval-review',
                    permissions: PANEL_ROUTE_PERMISSIONS.approvalReview,
                    notificationKey: 'approval_review',
                    requiresAssignedApproval: true
                },
                {
                    key: 'access-review',
                    label: 'Access Request Review',
                    icon: 'pi pi-key',
                    route: '/panel/access-review',
                    permissions: PANEL_ROUTE_PERMISSIONS.accessReview,
                    notificationKey: 'access_requests'
                },
                {
                    key: 'document-disposal',
                    label: 'Document Disposal',
                    icon: 'pi pi-trash',
                    route: '/panel/disposal',
                    permissions: PANEL_ROUTE_PERMISSIONS.disposalWorkspace,
                    notificationKey: 'disposal_requests'
                }
            ]
        },
        {
            id: 'administration',
            label: 'Administration',
            icon: 'pi pi-objects-column',
            items: [
                {
                    key: 'storage-admin',
                    label: 'Storage & Classification',
                    icon: 'pi pi-database',
                    route: '/panel/storage',
                    permissions: PANEL_ROUTE_PERMISSIONS.storageAdmin
                },
                {
                    key: 'user-management',
                    label: 'User Management',
                    icon: 'pi pi-users',
                    route: '/panel/users',
                    permissions: PANEL_ROUTE_PERMISSIONS.userManagement,
                    notificationKey: 'user_accounts'
                },
                {
                    key: 'roles-permissions',
                    label: 'Roles & Permissions',
                    icon: 'pi pi-shield',
                    route: '/panel/roles-permissions',
                    permissions: PANEL_ROUTE_PERMISSIONS.rolesPermissions
                },
                {
                    key: 'workflow-builder',
                    label: 'Workflow Builder',
                    icon: 'pi pi-sitemap',
                    route: '/panel/workflow-builder',
                    permissions: PANEL_ROUTE_PERMISSIONS.workflowBuilder
                }
            ]
        },
        {
            id: 'system',
            label: 'System',
            icon: 'pi pi-cog',
            items: [
                {
                    key: 'audit-logs',
                    label: 'Audit & Activity Logs',
                    icon: 'pi pi-list-check',
                    route: '/panel/audit-logs',
                    permissions: PANEL_ROUTE_PERMISSIONS.auditLogs
                },
                {
                    key: 'backup-restore',
                    label: 'Backup, Restore & Reset',
                    icon: 'pi pi-history',
                    route: '/panel/backup-restore',
                    permissions: PANEL_ROUTE_PERMISSIONS.backupRestore
                },
                {
                    key: 'system-settings',
                    label: 'System Settings',
                    icon: 'pi pi-sliders-h',
                    route: '/panel/settings',
                    permissions: PANEL_ROUTE_PERMISSIONS.systemSettings
                }
            ]
        }
    ]
};

export function canAccessPanelItem(item: Pick<PanelNavItem, 'permissions'>, permissions: readonly string[]) {
    return item.permissions.length === 0 || item.permissions.some((permission) => hasPanelPermission(permissions, permission));
}

export function shouldShowPanelItem(item: PanelNavItem, context: PanelAccessContext) {
    const hasAssignedApproval = item.requiresAssignedApproval && (context.assignedApprovalCount ?? 0) > 0;
    if (!canAccessPanelItem(item, context.permissions) && !hasAssignedApproval) return false;
    return !(item.hideForRoles ?? []).includes(context.roleName);
}

export function firstAuthorizedPanelUrl(permissions: readonly string[], roleName: PanelRoleName) {
    const context: PanelAccessContext = { permissions, roleName };
    const ordered = [PANEL_NAVIGATION.dashboard, ...PANEL_NAVIGATION.categories.flatMap((category) => category.items)];
    const workspace = ordered.find((item) => item.permissions.length > 0 && shouldShowPanelItem(item, context));
    if (workspace) return workspace.route;
    return ordered.find((item) => shouldShowPanelItem(item, context))?.route ?? '/panel/my-profile';
}
