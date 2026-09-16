import {
  DocumentType,
  Prisma,
  PrismaClient,
  WorkflowVersionStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import {
  DEFAULT_PERMISSION_CATALOG,
  DEFAULT_DOCUMENT_CONTROLLER_PERMISSION_NAMES,
  DEFAULT_INTERNAL_AUDIT_PERMISSION_NAMES,
  DEFAULT_PLANT_MANAGER_PERMISSION_NAMES,
  DEFAULT_STAFF_PERMISSION_NAMES,
  DEFAULT_VIEWER_PERMISSION_NAMES,
} from "../src/common/constants/permission-catalog";
import {
  locationCodeToNumeric,
  numericToLocationCode,
} from "../src/common/utils/location-code.util";

const prisma = new PrismaClient();

const DEFAULT_ADMIN_ROLE_NAME = "Admin";
const DEFAULT_ADMIN_USERNAME =
  process.env.DEFAULT_ADMIN_USERNAME?.trim().toLowerCase() ||
  "admin";
const DEFAULT_ADMIN_PASSWORD =
  process.env.DEFAULT_ADMIN_PASSWORD?.trim() || "admin123";
const DEFAULT_ADMIN_FIRSTNAME =
  process.env.DEFAULT_ADMIN_FIRSTNAME?.trim() || "Admin";
const DEFAULT_ADMIN_LASTNAME =
  process.env.DEFAULT_ADMIN_LASTNAME?.trim() || "User";
const CURRENT_BRAND_LOGO_URL = "/images/pk-dts-mark-v3.png";
const LEGACY_BRAND_LOGO_URLS = new Set([
  "/images/dts-logo.png",
  "/images/pk-dts-logo.png",
  "/images/pk-dts-logo-v2.png",
  "/images/peanut_kisses_logo-removebg-preview.png",
]);

const DEFAULT_LOCATIONS = [
  "Production Archive",
  "QA Records Room",
  "HR Cabinet",
  "Maintenance Office",
] as const;

const LOCATION_CODE_SEQUENCE_KEY = "location_code";

const DEFAULT_WORKFLOW_DEFINITIONS = [
  {
    workflow_key: "system-softcopy-standard",
    name: "Standard Softcopy Approval",
    description: "Default approval route for standard Softcopy requests.",
    document_type: DocumentType.SOFTCOPY,
  },
  {
    workflow_key: "system-softcopy-cancellation",
    name: "Softcopy Cancellation Approval",
    description: "Default approval route for Softcopy cancellation requests.",
    document_type: DocumentType.SOFTCOPY,
  },
  {
    workflow_key: "system-hardcopy-direct-approval",
    name: "Direct Hardcopy Approval",
    description: "Default direct approval route for Hardcopy requests.",
    document_type: DocumentType.HARDCOPY,
  },
] as const;

function defaultWorkflowGraph(
  workflowKey: string,
  plantManagerRoleId: bigint,
  documentControllerRoleId: bigint,
): Prisma.InputJsonValue {
  const approved = { key: "approved", label: "Approved", type: "END" };

  if (workflowKey === "system-softcopy-standard") {
    return {
      schema_version: 2,
      start_node_key: "noted-by",
      nodes: [
        {
          key: "noted-by",
          label: "Leader / Noted By",
          type: "APPROVAL",
          stage: "NOTED_BY",
          assignment: { type: "REQUESTER_LEADER" },
        },
        {
          key: "plant-manager",
          label: "Plant Manager Approval",
          type: "APPROVAL",
          stage: "PLANT_MANAGER",
          assignment: { type: "ROLE", role_id: String(plantManagerRoleId) },
        },
        {
          key: "document-controller",
          label: "Document Controller Approval",
          type: "APPROVAL",
          stage: "DOCUMENT_CONTROLLER_ADMIN",
          assignment: { type: "ROLE", role_id: String(documentControllerRoleId) },
        },
        approved,
      ],
      edges: [
        { key: "noted-by-approve", from: "noted-by", to: "plant-manager", outcome: "APPROVE" },
        { key: "plant-manager-approve", from: "plant-manager", to: "document-controller", outcome: "APPROVE" },
        { key: "document-controller-approve", from: "document-controller", to: "approved", outcome: "APPROVE" },
      ],
    } as Prisma.InputJsonValue;
  }

  if (workflowKey === "system-softcopy-cancellation") {
    return {
      schema_version: 2,
      start_node_key: "noted-by",
      nodes: [
        {
          key: "noted-by",
          label: "Leader / Noted By",
          type: "APPROVAL",
          stage: "NOTED_BY",
          assignment: { type: "REQUESTER_LEADER" },
        },
        {
          key: "document-controller",
          label: "Document Controller Approval",
          type: "APPROVAL",
          stage: "DOCUMENT_CONTROLLER_ADMIN",
          assignment: { type: "ROLE", role_id: String(documentControllerRoleId) },
        },
        approved,
      ],
      edges: [
        { key: "noted-by-approve", from: "noted-by", to: "document-controller", outcome: "APPROVE" },
        { key: "document-controller-approve", from: "document-controller", to: "approved", outcome: "APPROVE" },
      ],
    } as Prisma.InputJsonValue;
  }

  return {
    schema_version: 2,
    start_node_key: "hardcopy-approval",
    nodes: [
      {
        key: "hardcopy-approval",
        label: "Hardcopy Approval",
        type: "APPROVAL",
        stage: "HARDCOPY_APPROVAL",
        assignment: { type: "ROLE", role_id: String(documentControllerRoleId) },
      },
      approved,
    ],
    edges: [
      { key: "hardcopy-approval-approve", from: "hardcopy-approval", to: "approved", outcome: "APPROVE" },
    ],
  } as Prisma.InputJsonValue;
}

async function seedDefaultWorkflowDefinitions(
  createdByUserId: bigint,
  plantManagerRoleId: bigint,
  documentControllerRoleId: bigint,
) {
  for (const workflow of DEFAULT_WORKFLOW_DEFINITIONS) {
    const definition = await prisma.workflowDefinition.upsert({
      where: { workflow_key: workflow.workflow_key },
      update: {},
      create: {
        workflow_key: workflow.workflow_key,
        name: workflow.name,
        description: workflow.description,
        document_type: workflow.document_type,
        created_by_user_id: createdByUserId,
      },
    });
    await prisma.workflowVersion.upsert({
      where: {
        workflow_definition_id_version_number: {
          workflow_definition_id: definition.workflow_definition_id,
          version_number: 1,
        },
      },
      update: {},
      create: {
        workflow_definition_id: definition.workflow_definition_id,
        version_number: 1,
        status: WorkflowVersionStatus.PUBLISHED,
        graph: defaultWorkflowGraph(
          workflow.workflow_key,
          plantManagerRoleId,
          documentControllerRoleId,
        ),
        created_by_user_id: createdByUserId,
        published_by_user_id: createdByUserId,
        published_at: new Date(),
      },
    });
  }
}

async function main() {
  console.log("Starting database seed...");

  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

  const validPermissionNames = new Set(
    DEFAULT_PERMISSION_CATALOG.map((permission) => permission.permission_name),
  );

  const existingPermissions = await prisma.permission.findMany({
    select: { permission_id: true, permission_name: true },
  });

  const stalePermissionIds = existingPermissions
    .filter(
      (permission) => !validPermissionNames.has(permission.permission_name),
    )
    .map((permission) => permission.permission_id);

  if (stalePermissionIds.length) {
    await prisma.rolePermission.deleteMany({
      where: { permission_id: { in: stalePermissionIds } },
    });
    await prisma.permission.deleteMany({
      where: { permission_id: { in: stalePermissionIds } },
    });
  }

  const appearance = await prisma.systemAppearanceSetting.findUnique({
    where: { id: 1 },
    select: { settings_json: true },
  });
  const appearanceSettings = appearance?.settings_json;
  if (appearanceSettings && typeof appearanceSettings === "object" && !Array.isArray(appearanceSettings)) {
    const migratedAppearanceSettings: Prisma.JsonObject = {
      ...(appearanceSettings as Prisma.JsonObject),
    };
    let appearanceChanged = false;

    if (typeof appearanceSettings.logoUrl === "string" && LEGACY_BRAND_LOGO_URLS.has(appearanceSettings.logoUrl)) {
      migratedAppearanceSettings.logoUrl = CURRENT_BRAND_LOGO_URL;
      appearanceChanged = true;
    }
    if (typeof appearanceSettings.faviconUrl === "string" && LEGACY_BRAND_LOGO_URLS.has(appearanceSettings.faviconUrl)) {
      migratedAppearanceSettings.faviconUrl = CURRENT_BRAND_LOGO_URL;
      appearanceChanged = true;
    }

    if (appearanceChanged) {
      await prisma.systemAppearanceSetting.update({
        where: { id: 1 },
        data: { settings_json: migratedAppearanceSettings },
      });
    }
  }

  const permissionRecords = await Promise.all(
    DEFAULT_PERMISSION_CATALOG.map((permission) =>
      prisma.permission.upsert({
        where: { permission_name: permission.permission_name },
        update: {
          module_key: permission.module_key,
          module_label: permission.module_label,
          action_key: permission.action_key,
          action_label: permission.action_label,
          description: permission.description,
        },
        create: permission,
      }),
    ),
  );

  const adminRole = await prisma.role.upsert({
    where: { role_name: DEFAULT_ADMIN_ROLE_NAME },
    update: {
      description:
        "Default system administrator role with access to all protected modules.",
    },
    create: {
      role_name: DEFAULT_ADMIN_ROLE_NAME,
      description:
        "Default system administrator role with access to all protected modules.",
    },
  });

  const staffRole = await prisma.role.upsert({
    where: { role_name: "Staff" },
    update: {
      description:
        "Staff users manage their own folders, requests, attachments, and documents.",
    },
    create: {
      role_name: "Staff",
      description:
        "Staff users manage their own folders, requests, attachments, and documents.",
    },
  });
  const viewerRole = await prisma.role.upsert({
    where: { role_name: "Internal Audit" },
    update: {
      description:
        "Document management access for internal audit review and control.",
    },
    create: {
      role_name: "Internal Audit",
      description:
        "Document management access for internal audit review and control.",
    },
  });
  const plantManagerRole = await prisma.role.upsert({
    where: { role_name: "Plant Manager" },
    update: { description: "Approves requests assigned to the Plant Manager stage." },
    create: { role_name: "Plant Manager", description: "Approves requests assigned to the Plant Manager stage." },
  });
  const documentControllerRole = await prisma.role.upsert({
    where: { role_name: "Documentation Officer" },
    update: { description: "Approves and completes requests assigned to Document Control." },
    create: { role_name: "Documentation Officer", description: "Approves and completes requests assigned to Document Control." },
  });
  // db-push deployments also need the role consolidation used by SQL migrations.
  const systemRoles = [adminRole, viewerRole, staffRole, plantManagerRole, documentControllerRole];
  const obsoleteRoles = await prisma.role.findMany({ where: { role_id: { notIn: systemRoles.map((role) => role.role_id) } } });
  for (const oldRole of obsoleteRoles) {
    const normalized = oldRole.role_name.trim().toLowerCase().replace(/ /g, "");
    const target = ["admin", "administrator", "superadmin", "super-admin"].includes(normalized) ? adminRole
      : normalized === "viewer" ? viewerRole
      : ["documentcontroller", "document_controller", "documentcontrollerofficer", "documentationofficer"].includes(normalized) ? documentControllerRole
      : normalized === "plantmanager" ? plantManagerRole : staffRole;
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { role_id: oldRole.role_id }, data: { role_id: target.role_id } });
      await tx.accountRegistrationRequest.updateMany({ where: { requested_role_id: oldRole.role_id }, data: { requested_role_id: target.role_id } });
      await tx.accountRegistrationRequest.updateMany({ where: { assigned_role_id: oldRole.role_id }, data: { assigned_role_id: target.role_id } });
      await tx.documentWorkflowStep.updateMany({ where: { assigned_role_id: oldRole.role_id }, data: { assigned_role_id: target.role_id } });
      // Published graph role assignments must keep pointing to the replacement role.
      const versions = await tx.workflowVersion.findMany({ select: { workflow_version_id: true, graph: true } });
      const remapGraph = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(remapGraph);
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
          (key === "role_id" || key === "assigned_role_id") && String(item) === String(oldRole.role_id)
            ? String(target.role_id) : remapGraph(item)]));
      };
      for (const version of versions) {
        const graph = remapGraph(version.graph) as Prisma.InputJsonValue;
        if (JSON.stringify(graph) !== JSON.stringify(version.graph)) {
          await tx.workflowVersion.update({ where: { workflow_version_id: version.workflow_version_id }, data: { graph } });
        }
      }
      await tx.rolePermission.deleteMany({ where: { role_id: oldRole.role_id } });
      await tx.role.delete({ where: { role_id: oldRole.role_id } });
    });
  }

  for (const [role, permissionNames] of [
    [staffRole, DEFAULT_STAFF_PERMISSION_NAMES],
    [plantManagerRole, DEFAULT_PLANT_MANAGER_PERMISSION_NAMES],
    [documentControllerRole, DEFAULT_DOCUMENT_CONTROLLER_PERMISSION_NAMES],
    [viewerRole, DEFAULT_INTERNAL_AUDIT_PERMISSION_NAMES],
  ] as const) {
    const allowed = new Set<string>(permissionNames);
    const allowedPermissionIds = permissionRecords
      .filter((permission) => allowed.has(permission.permission_name))
      .map((permission) => permission.permission_id);
    await prisma.rolePermission.deleteMany({
      where: {
        role_id: role.role_id,
        permission_id: { notIn: allowedPermissionIds },
      },
    });
    await Promise.all(
      permissionRecords
        .filter((permission) => allowed.has(permission.permission_name))
        .map((permission) =>
          prisma.rolePermission.upsert({
            where: {
              role_id_permission_id: {
                role_id: role.role_id,
                permission_id: permission.permission_id,
              },
            },
            update: {},
            create: {
              role_id: role.role_id,
              permission_id: permission.permission_id,
            },
          }),
        ),
    );
  }

  const hardcopyStorageLinks = await prisma.hardcopyDocument.findMany({
    where: {
      OR: [{ asset_id: { not: null } }, { specific_id: { not: null } }],
    },
    select: { asset_id: true, specific_id: true, location_id: true },
  });
  const specificByAsset = new Map<bigint, bigint>();
  const assetByLocation = new Map<bigint, bigint>();
  for (const link of hardcopyStorageLinks) {
    if (
      link.asset_id &&
      link.specific_id &&
      !specificByAsset.has(link.asset_id)
    )
      specificByAsset.set(link.asset_id, link.specific_id);
    if (link.asset_id && !assetByLocation.has(link.location_id))
      assetByLocation.set(link.location_id, link.asset_id);
  }
  await Promise.all([
    ...Array.from(specificByAsset, ([asset_id, specific_id]) =>
      prisma.assetNumber.updateMany({
        where: { asset_id, specific_id: null },
        data: { specific_id },
      }),
    ),
    ...Array.from(assetByLocation, ([location_id, asset_id]) =>
      prisma.location.updateMany({
        where: { location_id, asset_id: null },
        data: { asset_id },
      }),
    ),
  ]);

  const administrativeRoles = await prisma.role.findMany({
    where: {
      role_name: {
        in: [
          "Admin",
          "Administrator",
          "Super Admin",
          "SuperAdmin",
          "Super-Admin",
        ],
      },
    },
    select: { role_id: true },
  });
  await Promise.all(
    administrativeRoles.flatMap((role) =>
      permissionRecords.map((permission) =>
        prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: role.role_id,
              permission_id: permission.permission_id,
            },
          },
          update: {},
          create: {
            role_id: role.role_id,
            permission_id: permission.permission_id,
          },
        }),
      ),
    ),
  );

  const existingAdmin = await prisma.user.findFirst({
    where: { role_id: adminRole.role_id }, orderBy: { user_id: "asc" },
  });
  const adminUsername = process.env.DEFAULT_ADMIN_USERNAME?.trim().toLowerCase()
    || existingAdmin?.username || DEFAULT_ADMIN_USERNAME;
  const adminUser = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      firstname: DEFAULT_ADMIN_FIRSTNAME,
      lastname: DEFAULT_ADMIN_LASTNAME,
      position_title: "System Administrator",
      role_id: adminRole.role_id,
    },
    create: {
      firstname: DEFAULT_ADMIN_FIRSTNAME,
      lastname: DEFAULT_ADMIN_LASTNAME,
      username: adminUsername,
      password: hashedPassword,
      position_title: "System Administrator",
      role_id: adminRole.role_id,
      require_password_change: true,
    },
  });

  await seedDefaultWorkflowDefinitions(
    adminUser.user_id,
    plantManagerRole.role_id,
    documentControllerRole.role_id,
  );

  await prisma.softcopyCategory.upsert({
    where: { folder_name: "uncategorized" },
    update: { is_active: true },
    create: {
      category_name: "Uncategorized",
      folder_name: "uncategorized",
      description:
        "Default category for existing and unclassified softcopy documents.",
    },
  });

  for (let index = 0; index < DEFAULT_LOCATIONS.length; index += 1) {
    const locationName = DEFAULT_LOCATIONS[index];
    const expectedCode = numericToLocationCode(index + 1);
    const existingLocation = await prisma.location.findUnique({
      where: { location_name: locationName },
    });

    if (!existingLocation) {
      await prisma.location.create({
        data: {
          location_name: locationName,
          location_code: expectedCode,
          is_active: true,
          archived_at: null,
        },
      });
      continue;
    }

    if (!existingLocation.location_code) {
      await prisma.location.update({
        where: { location_id: existingLocation.location_id },
        data: { location_code: expectedCode, is_active: true },
      });
    }
  }

  const allLocations = await prisma.location.findMany({
    orderBy: { location_id: "asc" },
  });

  for (let index = 0; index < allLocations.length; index += 1) {
    const location = allLocations[index];
    if (location.location_code) {
      continue;
    }

    await prisma.location.update({
      where: { location_id: location.location_id },
      data: { location_code: numericToLocationCode(index + 1) },
    });
  }

  const locationsWithCodes = await prisma.location.findMany({
    where: { location_code: { not: null } },
    select: { location_code: true },
  });

  const highestLocationCodeNumber = locationsWithCodes.reduce(
    (highest, location) =>
      Math.max(highest, locationCodeToNumeric(location.location_code!)),
    0,
  );

  await prisma.systemSequenceState.upsert({
    where: { sequence_key: LOCATION_CODE_SEQUENCE_KEY },
    update: { next_value: BigInt(highestLocationCodeNumber) },
    create: {
      sequence_key: LOCATION_CODE_SEQUENCE_KEY,
      next_value: BigInt(highestLocationCodeNumber),
    },
  });

  console.log("Database seed completed.");
  console.log(`Default admin username: ${DEFAULT_ADMIN_USERNAME}`);
  console.log(
    "The default admin account is seeded with require_password_change=true.",
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
