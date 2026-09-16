export interface PermissionCatalogEntry {
  permission_name: string;
  module_key: string;
  module_label: string;
  action_key: string;
  action_label: string;
  description: string;
}

interface PermissionModuleDefinition {
  module_key: string;
  module_label: string;
  actions: Array<{
    action_key: string;
    action_label: string;
    description: string;
  }>;
}

const permissionModules: PermissionModuleDefinition[] = [
  {
    module_key: "dashboard",
    module_label: "Dashboard",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View the dashboard module and its authorized summaries.",
      },
    ],
  },
  {
    module_key: "documents",
    module_label: "Documents",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View documents.",
      },
      {
        action_key: "create",
        action_label: "Create",
        description: "Create documents.",
      },
      {
        action_key: "create-direct",
        action_label: "Direct Softcopy Create",
        description: "Create a Softcopy directly without a Document Control Request when authorized.",
      },
      {
        action_key: "edit",
        action_label: "Edit",
        description: "Edit documents.",
      },
      {
        action_key: "manage",
        action_label: "Manage",
        description: "Manage all document records, files, revisions, and assignments.",
      },
      {
        action_key: "manage-own",
        action_label: "Manage Own Documents",
        description: "Manage documents created by the current user.",
      },
      {
        action_key: "attach-scans",
        action_label: "Attach Scanned Documents",
        description: "Attach scanned reference files to authorized Softcopy records.",
      },
      {
        action_key: "delete",
        action_label: "Delete",
        description: "Delete documents.",
      },
      {
        action_key: "dispose",
        action_label: "Dispose",
        description: "Dispose documents.",
      },
      {
        action_key: "restore",
        action_label: "Restore",
        description: "Restore disposed documents.",
      },
      {
        action_key: "import",
        action_label: "Import",
        description: "Import document records.",
      },
      {
        action_key: "export",
        action_label: "Export",
        description: "Export document records.",
      },
      {
        action_key: "download",
        action_label: "Download",
        description: "Download document files.",
      },
      {
        action_key: "search",
        action_label: "Search",
        description: "Search documents.",
      },
    ],
  },
  {
    module_key: "document-requests",
    module_label: "Document Requests",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View document requests and request ownership details.",
      },
      {
        action_key: "create",
        action_label: "Create",
        description: "Create document requests.",
      },
      {
        action_key: "view-own",
        action_label: "View Own",
        description: "View requests created by the current user.",
      },
      {
        action_key: "edit",
        action_label: "Edit",
        description: "Edit own draft and revision-requested records.",
      },
      {
        action_key: "submit",
        action_label: "Submit",
        description: "Submit and resubmit own requests.",
      },
      {
        action_key: "review",
        action_label: "Review",
        description: "View requests awaiting approval.",
      },
      {
        action_key: "request-revision",
        action_label: "Request Revision",
        description: "Return pending requests for revision.",
      },
      {
        action_key: "reject",
        action_label: "Reject",
        description: "Reject pending requests.",
      },
      {
        action_key: "delete",
        action_label: "Delete",
        description: "Delete eligible requests.",
      },
      {
        action_key: "approve-noted-by",
        action_label: "Approve as Noted By",
        description: "Approve the assigned Softcopy Noted By stage.",
      },
      {
        action_key: "approve-plant-manager",
        action_label: "Approve as Plant Manager",
        description: "Approve the assigned Softcopy Plant Manager stage.",
      },
      {
        action_key: "approve-document-controller",
        action_label: "Approve as Document Controller",
        description: "Approve the assigned Softcopy Document Controller/Admin stage.",
      },
      {
        action_key: "approve-hardcopy",
        action_label: "Approve Hardcopy Requests",
        description: "Approve the assigned Hardcopy request stage.",
      },
      {
        action_key: "complete",
        action_label: "Complete",
        description: "Complete an approved request as the configured final approver.",
      },
    ],
  },
  {
    module_key: "document-workflow",
    module_label: "Document Workflow",
    actions: [
      {
        action_key: "view",
        action_label: "View Workflow Definitions",
        description: "View published workflow definitions and version history.",
      },
      {
        action_key: "configure",
        action_label: "Build Workflows",
        description: "Create and edit draft workflow definitions, steps, assignments, conditions, and paths.",
      },
      {
        action_key: "publish",
        action_label: "Publish Workflows",
        description: "Publish immutable workflow versions for future requests.",
      },
    ],
  },
  {
    module_key: "hardcopy-transfers",
    module_label: "Hardcopy Transfers",
    actions: [
      {
        action_key: "view-own",
        action_label: "View Own Transfers",
        description: "View hardcopy transfers requested by or assigned to the current user.",
      },
      {
        action_key: "create",
        action_label: "Request Transfer",
        description: "Create a hardcopy transfer request.",
      },
      {
        action_key: "review",
        action_label: "Review Transfers",
        description: "View hardcopy transfers awaiting the configured approver's action.",
      },
      {
        action_key: "approve",
        action_label: "Approve Transfers",
        description: "Approve a hardcopy transfer request assigned to the current user.",
      },
      {
        action_key: "dispatch",
        action_label: "Dispatch Transfers",
        description: "Prepare and dispatch an approved hardcopy transfer.",
      },
      {
        action_key: "accept",
        action_label: "Accept Receipt",
        description: "Confirm physical receipt of a hardcopy transfer assigned to the current user.",
      },
    ],
  },
  {
    module_key: "document-access-requests",
    module_label: "Document Access Requests",
    actions: [
      {
        action_key: "catalog",
        action_label: "Search Request Catalog",
        description: "Search approved document metadata when requesting access.",
      },
      {
        action_key: "create",
        action_label: "Request Access",
        description: "Request document assignment for the current account.",
      },
      {
        action_key: "view-own",
        action_label: "View Own Requests",
        description: "View the current account's document access requests.",
      },
      {
        action_key: "cancel-own",
        action_label: "Cancel Own Requests",
        description: "Cancel the current account's pending document access requests.",
      },
      {
        action_key: "review",
        action_label: "Review Requests",
        description: "View pending document access requests from users.",
      },
      {
        action_key: "approve",
        action_label: "Approve Requests",
        description: "Approve access requests and assign documents to users.",
      },
      {
        action_key: "reject",
        action_label: "Reject Requests",
        description: "Reject document access requests.",
      },
      {
        action_key: "grant",
        action_label: "Grant Access",
        description: "Grant document access after the configured approver approves the request.",
      },
      {
        action_key: "revoke",
        action_label: "Revoke Access",
        description: "Revoke an existing document assignment.",
      },
      {
        action_key: "expire",
        action_label: "Expire Access",
        description: "Expire an approved document access request.",
      },
    ],
  },
  {
    module_key: "ai-document-assistant",
    module_label: "AI Document Assistant",
    actions: [
      {
        action_key: "search",
        action_label: "Search",
        description: "Search authorized documents with the document assistant.",
      },
    ],
  },
  {
    module_key: "document-disposal",
    module_label: "Document Disposal",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View disposed documents.",
      },
      {
        action_key: "dispose",
        action_label: "Dispose",
        description: "Dispose documents.",
      },
      {
        action_key: "request",
        action_label: "Request Disposal",
        description: "Submit disposal requests for administrator approval.",
      },
      {
        action_key: "review",
        action_label: "Review Disposal Requests",
        description: "Approve or reject pending disposal requests.",
      },
      {
        action_key: "restore",
        action_label: "Restore",
        description: "Restore disposed documents.",
      },
      {
        action_key: "manage",
        action_label: "Manage",
        description: "Manage document disposal workflows.",
      },
    ],
  },
  {
    module_key: "softcopy-folders",
    module_label: "Softcopy Folders",
    actions: [
      { action_key: "view", action_label: "View", description: "View authorized softcopy folders and subfolders." },
      { action_key: "create", action_label: "Create", description: "Create softcopy folders and subfolders." },
      { action_key: "edit", action_label: "Edit", description: "Rename or move authorized softcopy folders and subfolders." },
      { action_key: "delete", action_label: "Delete", description: "Delete authorized empty softcopy folders and subfolders." },
      { action_key: "manage", action_label: "Manage", description: "Manage all softcopy folders and subfolders." },
    ],
  },
  {
    module_key: "storage-classification",
    module_label: "Storage and Classification",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View storage and classification catalogs.",
      },
      {
        action_key: "create",
        action_label: "Create",
        description: "Create storage and classification records.",
      },
      {
        action_key: "edit",
        action_label: "Edit",
        description: "Edit storage and classification records.",
      },
      {
        action_key: "delete",
        action_label: "Delete",
        description: "Delete storage and classification records.",
      },
      {
        action_key: "manage",
        action_label: "Manage",
        description: "Manage storage and classification catalogs.",
      },
    ],
  },
  {
    module_key: "location-management",
    module_label: "Location Management",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View locations.",
      },
      {
        action_key: "create",
        action_label: "Create",
        description: "Create locations.",
      },
      {
        action_key: "edit",
        action_label: "Edit",
        description: "Edit locations.",
      },
      {
        action_key: "archive",
        action_label: "Archive",
        description: "Archive locations.",
      },
      {
        action_key: "manage",
        action_label: "Manage",
        description: "Manage locations.",
      },
    ],
  },
  {
    module_key: "batch-import",
    module_label: "Batch Import",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View batch import screens and results.",
      },
      {
        action_key: "import",
        action_label: "Import",
        description: "Run batch imports.",
      },
      {
        action_key: "manage",
        action_label: "Manage",
        description: "Manage batch import workflows.",
      },
    ],
  },
  {
    module_key: "user-accounts",
    module_label: "User Accounts",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View user accounts.",
      },
      {
        action_key: "create",
        action_label: "Create",
        description: "Create user accounts.",
      },
      {
        action_key: "edit",
        action_label: "Edit",
        description: "Edit user accounts.",
      },
      {
        action_key: "delete",
        action_label: "Delete",
        description: "Delete user accounts.",
      },
      {
        action_key: "manage",
        action_label: "Manage",
        description: "Manage user accounts.",
      },
      {
        action_key: "approve",
        action_label: "Approve registrations",
        description:
          "Review registration requests and assign approved account roles.",
      },
    ],
  },
  {
    module_key: "roles-permissions",
    module_label: "Roles and Permissions",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View roles and permissions.",
      },
      {
        action_key: "manage",
        action_label: "Manage",
        description: "Manage roles and permission assignments.",
      },
    ],
  },
  {
    module_key: "activity-logs",
    module_label: "Activity Logs",
    actions: [
      {
        action_key: "view_logs",
        action_label: "View Logs",
        description: "View activity logs.",
      },
    ],
  },
  {
    module_key: "backup-restore",
    module_label: "Backup, Restore and Reset",
    actions: [
      {
        action_key: "view",
        action_label: "View",
        description: "View backup, restore, and reset pages.",
      },
      {
        action_key: "create_backup",
        action_label: "Create Backup",
        description: "Create backups.",
      },
      {
        action_key: "download_backup",
        action_label: "Download Backup",
        description: "Download backups.",
      },
      {
        action_key: "restore_backup",
        action_label: "Restore Backup",
        description: "Restore backups.",
      },
      {
        action_key: "reset",
        action_label: "Factory Reset",
        description: "Back up the system, reset data, and reseed defaults.",
      },
      {
        action_key: "delete_backup",
        action_label: "Delete Backup",
        description: "Delete backups.",
      },
      {
        action_key: "view_logs",
        action_label: "View Backup Logs",
        description: "View backup logs.",
      },
    ],
  },
  {
    module_key: "system-settings",
    module_label: "System Settings",
    actions: [
      {
        action_key: "manage",
        action_label: "Manage",
        description:
          "Manage system branding, document behavior, and integration presentation settings.",
      },
    ],
  },
];

export const DEFAULT_PERMISSION_CATALOG: PermissionCatalogEntry[] =
  permissionModules.flatMap((moduleDefinition) =>
    moduleDefinition.actions.map((action) => ({
      permission_name: `${moduleDefinition.module_key}.${action.action_key}`,
      module_key: moduleDefinition.module_key,
      module_label: moduleDefinition.module_label,
      action_key: action.action_key,
      action_label: action.action_label,
      description: action.description,
    })),
  );

export const DEFAULT_PERMISSION_NAMES = DEFAULT_PERMISSION_CATALOG.map(
  (permission) => permission.permission_name,
);

export const DEFAULT_VIEWER_PERMISSION_NAMES = [
  "dashboard.view",
  "documents.view",
  "softcopy-folders.view",
] as const;

export const DEFAULT_STAFF_PERMISSION_NAMES = [
  "dashboard.view",
  "documents.view",
  "documents.create",
  "documents.manage-own",
  "documents.attach-scans",
  "documents.download",
  "documents.search",
  "ai-document-assistant.search",
  "document-requests.view",
  "document-requests.view-own",
  "document-requests.create",
  "document-requests.edit",
  "document-requests.submit",
  "document-access-requests.catalog",
  "document-access-requests.create",
  "document-access-requests.view-own",
  "document-access-requests.cancel-own",
  "document-disposal.request",
  "hardcopy-transfers.view-own",
  "hardcopy-transfers.create",
  "hardcopy-transfers.accept",
  "softcopy-folders.view",
  "softcopy-folders.create",
  "softcopy-folders.edit",
] as const;

export const DEFAULT_NOTED_BY_PERMISSION_NAMES = [
  ...DEFAULT_STAFF_PERMISSION_NAMES,
  "document-requests.review",
  "document-requests.approve-noted-by",
  "document-requests.request-revision",
  "document-requests.reject",
] as const;

export const DEFAULT_PLANT_MANAGER_PERMISSION_NAMES = [
  ...DEFAULT_STAFF_PERMISSION_NAMES,
  "document-requests.review",
  "document-requests.approve-plant-manager",
  "document-requests.request-revision",
  "document-requests.reject",
  "document-requests.complete",
  "hardcopy-transfers.review",
  "hardcopy-transfers.approve",
  "hardcopy-transfers.dispatch",
  "document-access-requests.review",
  "document-access-requests.approve",
  "document-access-requests.reject",
  "document-access-requests.grant",
  "document-access-requests.revoke",
  "document-access-requests.expire",
] as const;

export const DEFAULT_DOCUMENT_CONTROLLER_PERMISSION_NAMES = [
  ...DEFAULT_STAFF_PERMISSION_NAMES,
  "documents.manage",
  "softcopy-folders.manage",
  "softcopy-folders.delete",
  "document-requests.review",
  "document-requests.approve-document-controller",
  "document-requests.approve-hardcopy",
  "document-requests.request-revision",
  "document-requests.reject",
  "document-requests.complete",
  "hardcopy-transfers.review",
  "hardcopy-transfers.approve",
  "hardcopy-transfers.dispatch",
  "document-access-requests.review",
  "document-access-requests.approve",
  "document-access-requests.reject",
  "document-access-requests.grant",
  "document-access-requests.revoke",
  "document-access-requests.expire",
] as const;

export const DEFAULT_INTERNAL_AUDIT_PERMISSION_NAMES = [
  ...DEFAULT_VIEWER_PERMISSION_NAMES,
  "documents.manage",
  "softcopy-folders.manage",
  "softcopy-folders.create",
  "softcopy-folders.edit",
  "softcopy-folders.delete",
  "documents.search",
  "documents.download",
  "activity-logs.view_logs",
] as const;

export const SYSTEM_ROLE_NAMES = ["Admin", "Internal Audit", "Documentation Officer", "Staff", "Plant Manager"] as const;
