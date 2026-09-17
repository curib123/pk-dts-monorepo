-- Staff can use the Documents workspace folder layout but must not manage the separate Softcopy Folders workspace.
DELETE FROM "role_permissions" rp
USING "roles" role, "permissions" permission
WHERE rp."role_id" = role."role_id"
  AND permission."permission_id" = rp."permission_id"
  AND LOWER(TRIM(role."role_name")) = 'staff'
  AND permission."permission_name" IN (
    'softcopy-folders.view',
    'softcopy-folders.create',
    'softcopy-folders.edit',
    'softcopy-folders.delete',
    'softcopy-folders.manage'
  );
 