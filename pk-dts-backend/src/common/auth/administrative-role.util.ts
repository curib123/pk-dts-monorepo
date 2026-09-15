const CANONICAL_ADMIN_ROLE = "Admin";

/**
 * Compatibility helper for business rules that still distinguish the fixed
 * Admin role. Authorization must be enforced through permissions instead of
 * relying on this helper as an access-control bypass.
 */
export function isAdministrativeRole(roleName?: string | null): boolean {
  return roleName?.trim() === CANONICAL_ADMIN_ROLE;
}
