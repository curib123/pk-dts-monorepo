-- Give Internal Audit and Documentation Officer full document-domain management
-- without granting unrelated user, role, system, or workflow administration.
INSERT INTO "permissions" (
  "permission_name",
  "module_key",
  "module_label",
  "action_key",
  "action_label",
  "description"
)
VALUES (
  'documents.manage',
  'documents',
  'Documents',
  'manage',
  'Manage',
  'Manage all document records, files, revisions, and assignments.'
)
ON CONFLICT ("permission_name") DO UPDATE SET
  "module_key" = EXCLUDED."module_key",
  "module_label" = EXCLUDED."module_label",
  "action_key" = EXCLUDED."action_key",
  "action_label" = EXCLUDED."action_label",
  "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" role
JOIN "permissions" permission
  ON permission."permission_name" IN (
    'documents.manage',
    'softcopy-folders.manage',
    'softcopy-folders.create',
    'softcopy-folders.edit',
    'softcopy-folders.delete'
  )
WHERE LOWER(TRIM(role."role_name")) IN (
  'internal audit',
  'documentation officer',
  'document controller'
)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
