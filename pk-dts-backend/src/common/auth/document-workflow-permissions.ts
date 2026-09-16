import { AuthenticatedUser } from "./authenticated-user.interface";
import { isAdministrativeRole } from "./administrative-role.util";

export const DOCUMENT_APPROVAL_PERMISSIONS = [
  "document-requests.approve-noted-by",
  "document-requests.approve-plant-manager",
  "document-requests.approve-document-controller",
  "document-requests.approve-hardcopy",
] as const;

export const DOCUMENT_REVIEW_PERMISSIONS = [
  "document-requests.review",
  ...DOCUMENT_APPROVAL_PERMISSIONS.slice(1),
] as const;

export const DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION =
  "document-workflow.configure" as const;

export const DOCUMENT_MANAGEMENT_PERMISSION = "documents.manage" as const;

export function canManageDocuments(user: AuthenticatedUser) {
  return (
    isAdministrativeRole(user.role.role_name) ||
    user.role.permissions.includes(DOCUMENT_MANAGEMENT_PERMISSION)
  );
}

export function hasPermission(
  user: AuthenticatedUser,
  permission: string,
) {
  return (
    user.role.permissions.includes(permission) ||
    (permission.startsWith("documents.") &&
      user.role.permissions.includes(DOCUMENT_MANAGEMENT_PERMISSION))
  );
}

export function hasAnyPermission(
  user: AuthenticatedUser,
  permissions: readonly string[],
) {
  return permissions.some((permission) => hasPermission(user, permission));
}
