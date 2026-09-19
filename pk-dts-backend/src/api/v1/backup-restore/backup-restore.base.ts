import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentType, Prisma } from "@prisma/client";
import { spawn } from "child_process";
import { createReadStream } from "fs";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "path";
import { StreamableFile } from "@nestjs/common";
import AdmZip = require("adm-zip");
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  uploadsRoot,
  batchImportUploadsRoot,
  backupRestoreUploadsRoot,
  ensureRevisionUploadsRoot,
  revisionUploadsRoot,
} from "../../../config/upload-paths";
import {
  BackupListItem,
  BackupLogItem,
  BackupRestoreSnapshot,
  StoredBackupFile,
} from "./backup-restore.types";
import { FactoryResetScope } from "./dto/factory-reset.dto";

const BACKUP_LOG_FILE = "backup-activity.jsonl";
const BACKUP_FILE_PREFIX = "backup-";
const LEGACY_BACKUP_FILE_EXTENSION = ".json";
const BACKUP_FILE_EXTENSION = ".zip";
const BACKUP_SNAPSHOT_ENTRY = "snapshot.json";
const BACKUP_REVISION_UPLOADS_ENTRY = "uploads/revisions";
const SCHEMA_VERSION = 3;

interface RestoreContext {
  permissionIds: Map<string, bigint>;
  roleIds: Map<string, bigint>;
  areaIds: Map<string, bigint>;
  specificIds: Map<string, bigint>;
  locationIds: Map<string, bigint>;
  sequenceIds: Map<string, bigint>;
  assetIds: Map<string, bigint>;
  userIds: Map<string, bigint>;
  documentIds: Map<string, bigint>;
  softcopyIds: Map<string, bigint>;
  revisionIds: Map<string, bigint>;
  softcopyCategoryIds: Map<string, bigint>;
}

interface BackupPackage {
  snapshot: BackupRestoreSnapshot;
  filePath: string;
  fileName: string;
  isArchive: boolean;
}

@Injectable()
export class BackupRestoreService {
  private readonly backupListCache = new Map<
    string,
    { size: number; mtimeMs: number; item: BackupListItem }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listBackups(): Promise<BackupListItem[]> {
    const backupRoot = await this.ensureBackupRoot();
    const files = await this.listBackupFileNames(backupRoot);
    const activeFiles = new Set(files);

    for (const cachedFile of this.backupListCache.keys()) {
      if (!activeFiles.has(cachedFile)) {
        this.backupListCache.delete(cachedFile);
      }
    }

    const items = await Promise.all(
      files.map(async (fileName) => {
        const filePath = join(backupRoot, fileName);
        const fileStat = await stat(filePath);
        const cached = this.backupListCache.get(fileName);

        if (
          cached &&
          cached.size === fileStat.size &&
          cached.mtimeMs === fileStat.mtimeMs
        ) {
          return cached.item;
        }

        const backupPackage = await this.readBackupPackage(filePath);
        const snapshot = backupPackage.snapshot;
        const item = {
          backup_id: this.backupIdFromFileName(fileName),
          file_name: fileName,
          created_at: snapshot.created_at,
          created_by: snapshot.created_by,
          size_bytes: fileStat.size,
          record_count: this.snapshotRecordCount(snapshot),
          schema_version: snapshot.schema_version,
        } satisfies BackupListItem;

        this.backupListCache.set(fileName, {
          size: fileStat.size,
          mtimeMs: fileStat.mtimeMs,
          item,
        });

        return item;
      }),
    );

    return items.sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
  }

  async listLogs(): Promise<BackupLogItem[]> {
    const logPath = join(await this.ensureBackupRoot(), BACKUP_LOG_FILE);

    try {
      const raw = await readFile(logPath, "utf-8");
      return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as BackupLogItem)
        .sort(
          (left, right) =>
            new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async getBackupFileName(backupId: string) {
    return (await this.readBackupById(backupId)).fileName;
  }

  async listStoredBackupFiles(): Promise<StoredBackupFile[]> {
    const backupRoot = await this.ensureBackupRoot();
    const files = await this.listBackupFileNames(backupRoot);

    const entries = await Promise.all(
      files.map(async (fileName) => {
        const filePath = join(backupRoot, fileName);
        const fileStat = await stat(filePath);
        const backupPackage = await this.readBackupPackage(filePath);

        return {
          backup_id: this.backupIdFromFileName(fileName),
          file_name: fileName,
          file_path: filePath,
          size_bytes: fileStat.size,
          created_at: backupPackage.snapshot.created_at,
          updated_at: fileStat.mtime.toISOString(),
        } satisfies StoredBackupFile;
      }),
    );

    return entries.sort(
      (left, right) =>
        new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime(),
    );
  }

  async recordLog(entry: BackupLogItem) {
    await this.appendLog(entry);
  }

  async createBackup(performedBy = "system"): Promise<BackupListItem> {
    const backupRoot = await this.ensureBackupRoot();
    const snapshot = await this.buildSnapshot(performedBy);
    const fileName = this.createBackupFileName(snapshot.created_at);
    const filePath = join(backupRoot, fileName);

    await this.writeBackupArchive(filePath, snapshot);
    await this.appendLog({
      timestamp: snapshot.created_at,
      action: "created",
      backup_id: this.backupIdFromFileName(fileName),
      file_name: fileName,
      performed_by: performedBy,
      details: `Created backup with ${snapshot.summary.documents} documents and ${snapshot.summary.revisions} revision upload files.`,
    });

    return {
      backup_id: this.backupIdFromFileName(fileName),
      file_name: fileName,
      created_at: snapshot.created_at,
      created_by: snapshot.created_by,
      size_bytes: (await stat(filePath)).size,
      record_count: this.snapshotRecordCount(snapshot),
      schema_version: snapshot.schema_version,
    };
  }

  async downloadBackup(backupId: string, performedBy = "system") {
    const backupPackage = await this.readBackupById(backupId);
    await this.appendLog({
      timestamp: new Date().toISOString(),
      action: "downloaded",
      backup_id: this.backupIdFromFileName(backupPackage.fileName),
      file_name: backupPackage.fileName,
      performed_by: performedBy,
      details: "Backup file downloaded from the server.",
    });
    const stream = createReadStream(backupPackage.filePath);
    return new StreamableFile(stream);
  }

  async restoreBackup(backupId: string, performedBy = "system") {
    const backupPackage = await this.readBackupById(backupId);
    return this.restoreBackupPackage(backupPackage, performedBy);
  }

  async restoreUploadedBackup(file: Express.Multer.File | undefined, performedBy = "system") {
    if (!file) {
      throw new BadRequestException("Choose a backup .zip or legacy .json file to restore.");
    }

    try {
      const backupPackage = await this.readBackupPackage(file.path);
      return await this.restoreBackupPackage(backupPackage, performedBy);
    } finally {
      await rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  async factoryReset(
    performedBy = "system",
    scope = FactoryResetScope.ALL,
  ) {
    const safetyBackup = await this.createBackup(performedBy);

    let deletedDocuments: number | undefined;
    if (scope === FactoryResetScope.ALL) {
      await this.prisma.$transaction(
        async (tx) => {
          await this.clearDatabase(tx);
        },
        {
          maxWait: 10_000,
          timeout: 120_000,
        },
      );

      await this.resetUploadsData();
      await this.runSeedScript();
    } else {
      deletedDocuments = await this.prisma.$transaction(
        async (tx) => this.clearDocumentsByType(tx, scope),
        {
          maxWait: 10_000,
          timeout: 120_000,
        },
      );

      if (scope === FactoryResetScope.SOFTCOPY) {
        await rm(revisionUploadsRoot, { recursive: true, force: true });
        ensureRevisionUploadsRoot();
      }
    }

    const scopeLabel =
      scope === FactoryResetScope.ALL
        ? "all application data"
        : `all ${scope.toLowerCase()} documents`;

    await this.appendLog({
      timestamp: new Date().toISOString(),
      action: "reset",
      backup_id: safetyBackup.backup_id,
      file_name: safetyBackup.file_name,
      performed_by: performedBy,
      details: `Reset of ${scopeLabel} completed after creating safety backup ${safetyBackup.file_name}. Backup storage was preserved${scope === FactoryResetScope.ALL ? " and default seed data was restored" : ""}.`,
    });

    return {
      backup_id: safetyBackup.backup_id,
      file_name: safetyBackup.file_name,
      reset: true,
      scope,
      deleted_documents: deletedDocuments,
      restored_at: new Date().toISOString(),
    };
  }

  private async restoreBackupPackage(backupPackage: BackupPackage, performedBy = "system") {
    const snapshot = backupPackage.snapshot;

    if (![1, SCHEMA_VERSION].includes(snapshot.schema_version)) {
      throw new BadRequestException(
        `Unsupported backup schema version ${snapshot.schema_version}.`,
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        await this.clearDatabase(tx);
        const context = await this.restoreCatalog(tx, snapshot);
        await this.restoreUsers(tx, snapshot, context);
        await this.restoreDocuments(tx, snapshot, context);
        await this.restoreRevisions(tx, snapshot, context);
        await this.restoreSequenceStates(tx, snapshot);
        await this.restoreRolePermissions(tx, snapshot, context);
      },
      {
        maxWait: 10_000,
        timeout: 120_000,
      },
    );

    if (backupPackage.isArchive) {
      await this.restoreRevisionUploads(backupPackage.filePath);
    }

    await this.appendLog({
      timestamp: new Date().toISOString(),
      action: "restored",
      backup_id: this.backupIdFromFileName(backupPackage.fileName),
      file_name: backupPackage.fileName,
      performed_by: performedBy,
      details: `Restored ${snapshot.summary.documents} documents, ${snapshot.summary.users} users, and ${snapshot.summary.revisions} revision upload file references.`,
    });

    return {
      restored: true,
      backup_id: this.backupIdFromFileName(backupPackage.fileName),
      file_name: backupPackage.fileName,
      restored_at: new Date().toISOString(),
    };
  }

  async deleteBackup(backupId: string, performedBy = "system") {
    const backupPackage = await this.readBackupById(backupId);
    await rm(backupPackage.filePath);
    await this.appendLog({
      timestamp: new Date().toISOString(),
      action: "deleted",
      backup_id: this.backupIdFromFileName(backupPackage.fileName),
      file_name: backupPackage.fileName,
      performed_by: performedBy,
      details: "Backup file removed from the server.",
    });

    return { deleted: true, backup_id: this.backupIdFromFileName(backupPackage.fileName) };
  }

  private async buildSnapshot(performedBy: string): Promise<BackupRestoreSnapshot> {
    const [
      permissions,
      roles,
      rolePermissions,
      areas,
      specifics,
      locations,
      sequences,
      systemSequenceStates,
      assetNumbers,
      users,
      documents,
      hardcopies,
      softcopyCategories,
      softcopies,
      revisions,
    ] = await this.prisma.$transaction([
      this.prisma.permission.findMany({ orderBy: { permission_id: "asc" } }),
      this.prisma.role.findMany({ orderBy: { role_id: "asc" } }),
      this.prisma.rolePermission.findMany({
        orderBy: { role_permission_id: "asc" },
        include: {
          role: { select: { role_name: true } },
          permission: { select: { permission_name: true } },
        },
      }),
      this.prisma.area.findMany({ orderBy: { area_id: "asc" } }),
      this.prisma.specific.findMany({
        orderBy: { specific_id: "asc" },
        include: { area: { select: { area_name: true } } },
      }),
      this.prisma.location.findMany({ orderBy: { location_id: "asc" } }),
      this.prisma.sequence.findMany({ orderBy: { sequence_id: "asc" } }),
      this.prisma.systemSequenceState.findMany({
        orderBy: { sequence_key: "asc" },
      }),
      this.prisma.assetNumber.findMany({ orderBy: { asset_id: "asc" } }),
      this.prisma.user.findMany({
        orderBy: { user_id: "asc" },
        include: { role: { select: { role_name: true } } },
      }),
      this.prisma.document.findMany({
        orderBy: { document_id: "asc" },
        include: {
          creator: { select: { username: true } },
          requester: { select: { username: true } },
          disposer: { select: { username: true } },
          softcopy: { select: { document_number: true } },
        },
      }),
      this.prisma.hardcopyDocument.findMany({
        orderBy: { hardcopy_id: "asc" },
        include: {
          document: { select: { document_id: true } },
          asset: { select: { asset_number: true } },
          area: { select: { area_name: true } },
          specific: { select: { specific_name: true } },
          location: { select: { location_name: true } },
          sequence: { select: { sequence_code: true } },
        },
      }),
      this.prisma.softcopyCategory.findMany({
        orderBy: { softcopy_category_id: "asc" },
      }),
      this.prisma.softcopyDocument.findMany({
        orderBy: { softcopy_id: "asc" },
        include: {
          document: { select: { document_id: true } },
          category: { select: { category_name: true, folder_name: true } },
          current_revision: { select: { revision_number: true } },
        },
      }),
      this.prisma.documentRevision.findMany({
        orderBy: { revision_id: "asc" },
        include: {
          softcopy: { include: { document: true } },
          uploader: { select: { username: true } },
          approver: { select: { username: true } },
        },
      }),
    ]);

    return {
      schema_version: SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      created_by: performedBy,
      summary: {
        permissions: permissions.length,
        roles: roles.length,
        role_permissions: rolePermissions.length,
        areas: areas.length,
        specifics: specifics.length,
        locations: locations.length,
        sequences: sequences.length,
        system_sequence_states: systemSequenceStates.length,
        asset_numbers: assetNumbers.length,
        users: users.length,
        documents: documents.length,
        hardcopies: hardcopies.length,
        softcopy_categories: softcopyCategories.length,
        softcopies: softcopies.length,
        revisions: revisions.length,
      },
      data: {
        permissions: permissions.map((permission) => ({
          permission_name: permission.permission_name,
          module_key: permission.module_key,
          module_label: permission.module_label,
          action_key: permission.action_key,
          action_label: permission.action_label,
          description: permission.description,
        })),
        roles: roles.map((role) => ({
          role_name: role.role_name,
          description: role.description,
        })),
        role_permissions: rolePermissions.map((link) => ({
          role_name: link.role.role_name,
          permission_name: link.permission.permission_name,
        })),
        areas: areas.map((area) => ({
          area_name: area.area_name,
        })),
        specifics: specifics.map((specific) => ({
          specific_name: specific.specific_name,
          area_name: specific.area?.area_name ?? null,
        })),
        locations: locations.map((location) => ({
          location_name: location.location_name,
          location_code: location.location_code,
          is_active: location.is_active,
          archived_at: location.archived_at?.toISOString() ?? null,
          created_at: location.created_at.toISOString(),
          updated_at: location.updated_at.toISOString(),
        })),
        sequences: sequences.map((sequence) => ({
          sequence_code: sequence.sequence_code,
        })),
        system_sequence_states: systemSequenceStates.map((state) => ({
          sequence_key: state.sequence_key,
          next_value: state.next_value.toString(),
        })),
        asset_numbers: assetNumbers.map((asset) => ({
          asset_number: asset.asset_number,
          created_at: asset.created_at.toISOString(),
        })),
        users: users.map((user) => ({
          email: user.username,
          firstname: user.firstname,
          lastname: user.lastname,
          middlename: user.middlename,
          position_title: user.position_title,
          password: user.password,
          require_password_change: user.require_password_change,
          role_name: user.role.role_name,
          created_at: user.created_at.toISOString(),
          updated_at: user.updated_at.toISOString(),
        })),
        documents: documents.map((document) => ({
          document_key: document.document_id.toString(),
          document_number: document.softcopy?.document_number ?? null,
          document_title: document.document_title,
          document_type: document.document_type,
          status: document.status,
          request_date: document.request_date.toISOString(),
          department: document.department,
          business_document_type: document.business_document_type,
          action_requested: document.action_requested,
          from_party: document.from_party,
          to_party: document.to_party,
          reason_for_change: document.reason_for_change,
          brief_description: document.brief_description,
          proposed_change: document.proposed_change,
          revision_level_from: document.revision_level_from,
          revision_level_to: document.revision_level_to,
          previous_effective_date: document.previous_effective_date?.toISOString() ?? null,
          new_effective_date: document.new_effective_date?.toISOString() ?? null,
          date_received: document.date_received?.toISOString() ?? null,
          date_released: document.date_released?.toISOString() ?? null,
          approval_date: document.approval_date?.toISOString() ?? null,
          legacy_imported: document.legacy_imported,
          legacy_import_note: document.legacy_import_note,
          status_before_disposal: document.status_before_disposal,
          requested_by_name: document.requested_by_name,
          disposal_remarks: document.disposal_remarks,
          disposed_at: document.disposed_at?.toISOString() ?? null,
          disposed_by_name: document.disposed_by_name,
          created_by_email: document.creator.username,
          requested_by_email: document.requester?.username ?? null,
          disposed_by_email: document.disposer?.username ?? null,
          created_at: document.created_at.toISOString(),
          updated_at: document.updated_at.toISOString(),
        })),
        hardcopies: hardcopies.map((hardcopy) => ({
          document_key: hardcopy.document.document_id.toString(),
          document_number: null,
          asset_number: hardcopy.asset?.asset_number ?? null,
          area_name: hardcopy.area.area_name,
          specific_name: hardcopy.specific?.specific_name ?? null,
          location_name: hardcopy.location.location_name,
          sequence_code: hardcopy.sequence?.sequence_code ?? null,
          created_at: hardcopy.created_at.toISOString(),
        })),
        softcopy_categories: softcopyCategories.map((category) => ({
          category_name: category.category_name,
          folder_name: category.folder_name,
          parent_folder_name: softcopyCategories.find((candidate) => candidate.softcopy_category_id === category.parent_category_id)?.folder_name ?? null,
          description: category.description,
          is_active: category.is_active,
          created_at: category.created_at.toISOString(),
          updated_at: category.updated_at.toISOString(),
        })),
        softcopies: softcopies.map((softcopy) => ({
          document_key: softcopy.document.document_id.toString(),
          document_number: softcopy.document_number,
          category_name: softcopy.category.category_name,
          category_folder_name: softcopy.category.folder_name,
          current_revision_number:
            softcopy.current_revision?.revision_number ?? null,
          created_at: softcopy.created_at.toISOString(),
        })),
        revisions: revisions.map((revision) => ({
          document_key: revision.softcopy.document.document_id.toString(),
          document_number: revision.softcopy.document_number,
          revision_number: revision.revision_number,
          reason_of_revision: revision.reason_of_revision,
          effective_date: revision.effective_date?.toISOString() ?? null,
          page_number: revision.page_number,
          series_number: revision.series_number,
          revision_level_from: revision.revision_level_from,
          revision_level_to: revision.revision_level_to,
          previous_effective_date: revision.previous_effective_date?.toISOString() ?? null,
          new_effective_date: revision.new_effective_date?.toISOString() ?? null,
          date_received: revision.date_received?.toISOString() ?? null,
          date_released: revision.date_released?.toISOString() ?? null,
          approval_date: revision.approval_date?.toISOString() ?? null,
          is_current: revision.is_current,
          is_historical: revision.is_historical,
          approved_by_email: revision.approver?.username ?? null,
          approved_at: revision.approved_at?.toISOString() ?? null,
          document_title: revision.document_title || revision.softcopy.document_number || "Restored document",
          file_name: revision.file_name,
          file_path: revision.file_path,
          file_size: revision.file_size?.toString() ?? null,
          mime_type: revision.mime_type,
          uploaded_by_email: revision.uploader.username,
          created_at: revision.created_at.toISOString(),
        })),
      },
    };
  }

  private async restoreCatalog(tx: Prisma.TransactionClient, snapshot: BackupRestoreSnapshot): Promise<RestoreContext> {
    const permissionIds = new Map<string, bigint>();
    const roleIds = new Map<string, bigint>();
    const areaIds = new Map<string, bigint>();
    const specificIds = new Map<string, bigint>();
    const locationIds = new Map<string, bigint>();
    const sequenceIds = new Map<string, bigint>();
    const assetIds = new Map<string, bigint>();
    const userIds = new Map<string, bigint>();
    const documentIds = new Map<string, bigint>();
    const softcopyIds = new Map<string, bigint>();
    const revisionIds = new Map<string, bigint>();
    const softcopyCategoryIds = new Map<string, bigint>();

    for (const permission of snapshot.data.permissions) {
      const created = await tx.permission.create({ data: permission });
      permissionIds.set(permission.permission_name, created.permission_id);
    }

    for (const role of snapshot.data.roles) {
      const created = await tx.role.create({ data: role });
      roleIds.set(role.role_name, created.role_id);
    }

    for (const area of snapshot.data.areas) {
      const created = await tx.area.create({ data: area });
      areaIds.set(area.area_name, created.area_id);
    }

    for (const location of snapshot.data.locations) {
      const created = await tx.location.create({
        data: {
          location_name: location.location_name,
          location_code: location.location_code,
          is_active: location.is_active,
          archived_at: location.archived_at ? new Date(location.archived_at) : null,
          created_at: new Date(location.created_at),
          updated_at: new Date(location.updated_at),
        },
      });
      locationIds.set(location.location_name, created.location_id);
    }

    for (const sequence of snapshot.data.sequences) {
      const created = await tx.sequence.create({ data: sequence });
      sequenceIds.set(sequence.sequence_code, created.sequence_id);
    }

    for (const asset of snapshot.data.asset_numbers) {
      const created = await tx.assetNumber.create({
        data: {
          asset_number: asset.asset_number,
          created_at: new Date(asset.created_at),
        },
      });
      assetIds.set(asset.asset_number, created.asset_id);
    }

    for (const specific of snapshot.data.specifics) {
      const created = await tx.specific.create({
        data: {
          specific_name: specific.specific_name,
          area_id: specific.area_name ? areaIds.get(specific.area_name) ?? null : null,
        },
      });
      specificIds.set(specific.specific_name, created.specific_id);
    }

    const categorySnapshots = snapshot.data.softcopy_categories?.length
      ? snapshot.data.softcopy_categories
      : [
          {
            category_name: "Uncategorized",
            folder_name: "uncategorized",
            description: "Default category for restored legacy softcopy documents.",
            is_active: true,
            created_at: snapshot.created_at,
            updated_at: snapshot.created_at,
          },
        ];
    const pendingCategories = [...categorySnapshots];
    while (pendingCategories.length) {
      const nextIndex = pendingCategories.findIndex((category) => !category.parent_folder_name || softcopyCategoryIds.has(category.parent_folder_name));
      if (nextIndex < 0) throw new BadRequestException("Softcopy folder hierarchy contains a missing or circular main folder.");
      const [category] = pendingCategories.splice(nextIndex, 1);
      const created = await tx.softcopyCategory.create({
        data: {
          category_name: category.category_name,
          folder_name: category.folder_name,
          parent_category_id: category.parent_folder_name ? softcopyCategoryIds.get(category.parent_folder_name) : null,
          description: category.description,
          is_active: category.is_active,
          created_at: new Date(category.created_at),
          updated_at: new Date(category.updated_at),
        },
      });
      softcopyCategoryIds.set(category.folder_name, created.softcopy_category_id);
      if (!softcopyCategoryIds.has(category.category_name)) softcopyCategoryIds.set(category.category_name, created.softcopy_category_id);
    }

    return {
      permissionIds,
      roleIds,
      areaIds,
      specificIds,
      locationIds,
      sequenceIds,
      assetIds,
      userIds,
      documentIds,
      softcopyIds,
      revisionIds,
      softcopyCategoryIds,
    };
  }

  private async restoreUsers(
    tx: Prisma.TransactionClient,
    snapshot: BackupRestoreSnapshot,
    context: RestoreContext,
  ) {
    for (const user of snapshot.data.users) {
      const roleId = context.roleIds.get(user.role_name);
      if (!roleId) {
        throw new BadRequestException(`Missing role for user ${user.email}.`);
      }

      const created = await tx.user.create({
        data: {
          username: user.email,
          firstname: user.firstname,
          lastname: user.lastname,
          middlename: user.middlename,
          position_title: user.position_title,
          password: user.password,
          require_password_change: user.require_password_change,
          role_id: roleId,
          created_at: new Date(user.created_at),
          updated_at: new Date(user.updated_at),
        },
      });

      context.userIds.set(user.email, created.user_id);
    }
  }

  private async restoreDocuments(
    tx: Prisma.TransactionClient,
    snapshot: BackupRestoreSnapshot,
    context: RestoreContext,
  ) {
    for (const document of snapshot.data.documents) {
      const createdById = context.userIds.get(document.created_by_email);
      if (!createdById) {
        throw new BadRequestException(
          `Missing creator for document ${document.document_number ?? document.document_title}.`,
        );
      }

      const disposerId = document.disposed_by_email
        ? context.userIds.get(document.disposed_by_email) ?? null
        : null;
      const requesterId = document.requested_by_email
        ? context.userIds.get(document.requested_by_email) ?? null
        : null;

      const created = await tx.document.create({
        data: {
          document_title: document.document_title,
          document_type: document.document_type,
          status: document.status as any,
          request_date: document.request_date ? new Date(document.request_date) : undefined,
          department: document.department,
          business_document_type: document.business_document_type as any,
          action_requested: document.action_requested as any,
          from_party: document.from_party,
          to_party: document.to_party,
          reason_for_change: document.reason_for_change as any,
          brief_description: document.brief_description,
          proposed_change: document.proposed_change,
          revision_level_from: document.revision_level_from,
          revision_level_to: document.revision_level_to,
          previous_effective_date: document.previous_effective_date ? new Date(document.previous_effective_date) : null,
          new_effective_date: document.new_effective_date ? new Date(document.new_effective_date) : null,
          date_received: document.date_received ? new Date(document.date_received) : null,
          date_released: document.date_released ? new Date(document.date_released) : null,
          approval_date: document.approval_date ? new Date(document.approval_date) : null,
          legacy_imported: document.legacy_imported ?? false,
          legacy_import_note: document.legacy_import_note,
          status_before_disposal: document.status_before_disposal as any,
          requested_by_name: document.requested_by_name,
          disposal_remarks: document.disposal_remarks,
          disposed_at: document.disposed_at ? new Date(document.disposed_at) : null,
          disposed_by_name: document.disposed_by_name,
          created_by: createdById,
          requested_by_user_id: requesterId,
          disposed_by_user_id: disposerId,
          created_at: new Date(document.created_at),
          updated_at: new Date(document.updated_at),
        },
      });

      const documentKey = document.document_key ?? document.document_number;
      if (!documentKey) throw new BadRequestException(`Backup document ${document.document_title} has no relation key.`);
      context.documentIds.set(documentKey, created.document_id);
    }

    for (const hardcopy of snapshot.data.hardcopies) {
      const documentKey = hardcopy.document_key;
      const documentId = documentKey ? context.documentIds.get(documentKey) : undefined;
      const areaId = context.areaIds.get(hardcopy.area_name);
      const locationId = context.locationIds.get(hardcopy.location_name);

      if (!documentId || !areaId || !locationId) {
        throw new BadRequestException(
          `Missing hardcopy relation for document ${hardcopy.document_key ?? "unknown"}.`,
        );
      }

      const created = await tx.hardcopyDocument.create({
        data: {
          document_id: documentId,
          asset_id: hardcopy.asset_number
            ? context.assetIds.get(hardcopy.asset_number) ?? null
            : null,
          area_id: areaId,
          specific_id: hardcopy.specific_name
            ? context.specificIds.get(hardcopy.specific_name) ?? null
            : null,
          location_id: locationId,
          sequence_id: hardcopy.sequence_code
            ? context.sequenceIds.get(hardcopy.sequence_code) ?? null
            : null,
          created_at: new Date(hardcopy.created_at),
        },
      });

      void created;
    }

    for (const softcopy of snapshot.data.softcopies) {
      const documentKey = softcopy.document_key ?? softcopy.document_number;
      const documentId = documentKey ? context.documentIds.get(documentKey) : undefined;
      if (!documentId) {
        throw new BadRequestException(
          `Missing softcopy document ${softcopy.document_number}.`,
        );
      }

      const created = await tx.softcopyDocument.create({
        data: {
          document_id: documentId,
          document_number: softcopy.document_number ??
            snapshot.data.documents.find((candidate) => candidate.document_key === documentKey)?.document_number ??
            null,
          softcopy_category_id:
            context.softcopyCategoryIds.get(softcopy.category_folder_name ?? softcopy.category_name ?? "Uncategorized") ??
            context.softcopyCategoryIds.get("Uncategorized")!,
          created_at: new Date(softcopy.created_at),
        },
      });

      context.softcopyIds.set(documentKey!, created.softcopy_id);
    }
  }

  private async restoreRevisions(
    tx: Prisma.TransactionClient,
    snapshot: BackupRestoreSnapshot,
    context: RestoreContext,
  ) {
    for (const revision of snapshot.data.revisions) {
      const documentKey = revision.document_key ?? revision.document_number;
      const softcopyId = documentKey ? context.softcopyIds.get(documentKey) : undefined;
      const uploadedById = context.userIds.get(revision.uploaded_by_email);

      if (!softcopyId || !uploadedById) {
        throw new BadRequestException(
          `Missing softcopy or uploader for revision ${revision.revision_number} of ${revision.document_number}.`,
        );
      }

      const created = await tx.documentRevision.create({
        data: {
          softcopy_id: softcopyId,
          revision_number: revision.revision_number,
          reason_of_revision: revision.reason_of_revision,
          effective_date: revision.effective_date
            ? new Date(revision.effective_date)
            : null,
          page_number: revision.page_number,
          series_number: revision.series_number ?? null,
          document_title: revision.document_title || revision.document_number || "Restored document",
          revision_level_from: revision.revision_level_from ?? null,
          revision_level_to: revision.revision_level_to ?? null,
          previous_effective_date: revision.previous_effective_date ? new Date(revision.previous_effective_date) : null,
          new_effective_date: revision.new_effective_date ? new Date(revision.new_effective_date) : null,
          date_received: revision.date_received ? new Date(revision.date_received) : null,
          date_released: revision.date_released ? new Date(revision.date_released) : null,
          approval_date: revision.approval_date ? new Date(revision.approval_date) : null,
          is_current: revision.is_current ?? false,
          is_historical: revision.is_historical ?? false,
          approved_by_user_id: revision.approved_by_email ? context.userIds.get(revision.approved_by_email) ?? null : null,
          approved_at: revision.approved_at ? new Date(revision.approved_at) : null,
          file_name: revision.file_name,
          file_path: revision.file_path,
          file_size: revision.file_size ? BigInt(revision.file_size) : null,
          mime_type: revision.mime_type,
          uploaded_by: uploadedById,
          created_at: new Date(revision.created_at),
        },
      });

      context.revisionIds.set(
        `${documentKey}:${revision.revision_number}`,
        created.revision_id,
      );
    }

    for (const softcopy of snapshot.data.softcopies) {
      if (!softcopy.current_revision_number) {
        continue;
      }

      const documentKey = softcopy.document_key ?? softcopy.document_number;
      const softcopyId = documentKey ? context.softcopyIds.get(documentKey) : undefined;
      const revisionId = context.revisionIds.get(
        `${documentKey}:${softcopy.current_revision_number}`,
      );

      if (!softcopyId || !revisionId) {
        throw new BadRequestException(
          `Missing current revision for softcopy ${softcopy.document_number}.`,
        );
      }

      await tx.softcopyDocument.update({
        where: { softcopy_id: softcopyId },
        data: { current_revision_id: revisionId },
      });
    }
  }

  private async restoreSequenceStates(
    tx: Prisma.TransactionClient,
    snapshot: BackupRestoreSnapshot,
  ) {
    for (const state of snapshot.data.system_sequence_states) {
      await tx.systemSequenceState.create({
        data: {
          sequence_key: state.sequence_key,
          next_value: BigInt(state.next_value),
        },
      });
    }
  }

  private async restoreRolePermissions(
    tx: Prisma.TransactionClient,
    snapshot: BackupRestoreSnapshot,
    context: RestoreContext,
  ) {
    for (const link of snapshot.data.role_permissions) {
      const roleId = context.roleIds.get(link.role_name);
      const permissionId = context.permissionIds.get(link.permission_name);

      if (!roleId || !permissionId) {
        throw new BadRequestException(
          `Missing role-permission link for ${link.role_name} and ${link.permission_name}.`,
        );
      }

      await tx.rolePermission.create({
        data: {
          role_id: roleId,
          permission_id: permissionId,
        },
      });
    }
  }

  private async clearDatabase(tx: Prisma.TransactionClient) {
    await tx.softcopyDocument.updateMany({
      data: { current_revision_id: null },
    });
    await tx.documentRevision.deleteMany({});
    await tx.softcopyDocument.deleteMany({});
    await tx.softcopyCategory.deleteMany({});
    await tx.hardcopyDocument.deleteMany({});
    await tx.document.deleteMany({});
    await tx.accountRegistrationRequest.deleteMany({});
    await tx.rolePermission.deleteMany({});
    await tx.user.deleteMany({});
    await tx.assetNumber.deleteMany({});
    await tx.specific.deleteMany({});
    await tx.sequence.deleteMany({});
    await tx.systemSequenceState.deleteMany({});
    await tx.location.deleteMany({});
    await tx.area.deleteMany({});
    await tx.role.deleteMany({});
    await tx.permission.deleteMany({});
  }

  private async clearDocumentsByType(
    tx: Prisma.TransactionClient,
    scope: FactoryResetScope.SOFTCOPY | FactoryResetScope.HARDCOPY,
  ) {
    if (scope === FactoryResetScope.SOFTCOPY) {
      await tx.softcopyDocument.updateMany({
        data: { current_revision_id: null },
      });
    }

    const result = await tx.document.deleteMany({
      where: { document_type: scope as DocumentType },
    });
    return result.count;
  }

  private async ensureBackupRoot() {
    const backupRoot = this.getBackupRoot();
    await mkdir(backupRoot, { recursive: true });
    return backupRoot;
  }

  private async listBackupFileNames(backupRoot: string) {
    return (await readdir(backupRoot)).filter((file) =>
      file.startsWith(BACKUP_FILE_PREFIX) &&
      (file.endsWith(BACKUP_FILE_EXTENSION) ||
        file.endsWith(LEGACY_BACKUP_FILE_EXTENSION)),
    );
  }

  private getBackupRoot() {
    return this.config.get<string>("BACKUP_RESTORE_DIR") || join(process.cwd(), "backup-store");
  }

  private createBackupFileName(createdAt: string) {
    const compact = createdAt
      .replace(/[:]/g, "-")
      .replace(/\./g, "-")
      .replace(/T/, "_")
      .replace(/Z$/, "Z");

    const suffix = Math.random().toString(36).slice(2, 8);
    return `${BACKUP_FILE_PREFIX}${compact}-${suffix}${BACKUP_FILE_EXTENSION}`;
  }

  private snapshotRecordCount(snapshot: BackupRestoreSnapshot) {
    return Object.values(snapshot.summary).reduce((total, count) => total + count, 0);
  }

  private async readSnapshotFile(filePath: string): Promise<BackupRestoreSnapshot> {
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as BackupRestoreSnapshot;
    } catch {
      throw new BadRequestException(
        `The backup file "${basename(filePath)}" is not a valid JSON snapshot.`,
      );
    }
  }

  private async readBackupPackage(filePath: string): Promise<BackupPackage> {
    const fileName = basename(filePath);
    const extension = extname(fileName).toLowerCase();

    if (extension === LEGACY_BACKUP_FILE_EXTENSION) {
      return {
        snapshot: await this.readSnapshotFile(filePath),
        filePath,
        fileName,
        isArchive: false,
      };
    }

    if (extension !== BACKUP_FILE_EXTENSION) {
      throw new BadRequestException("Backup files must be .zip packages or legacy .json snapshots.");
    }

    try {
      const zip = new AdmZip(filePath);
      const snapshotEntry = zip.getEntry(BACKUP_SNAPSHOT_ENTRY);
      if (!snapshotEntry) {
        throw new BadRequestException("The backup package is missing snapshot.json.");
      }

      return {
        snapshot: JSON.parse(snapshotEntry.getData().toString("utf-8")) as BackupRestoreSnapshot,
        filePath,
        fileName,
        isArchive: true,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `The backup package "${fileName}" is invalid or incomplete. Upload a backup created by this system or a valid legacy .json snapshot.`,
      );
    }
  }

  private async readBackupById(backupId: string): Promise<BackupPackage> {
    const backupRoot = await this.ensureBackupRoot();
    const candidates =
      backupId.endsWith(BACKUP_FILE_EXTENSION) ||
      backupId.endsWith(LEGACY_BACKUP_FILE_EXTENSION)
        ? [backupId]
        : [
            `${backupId}${BACKUP_FILE_EXTENSION}`,
            `${backupId}${LEGACY_BACKUP_FILE_EXTENSION}`,
          ];

    for (const candidate of candidates) {
      const backupPath = join(backupRoot, candidate);
      try {
        await stat(backupPath);
        return this.readBackupPackage(backupPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }

    throw new NotFoundException(`Backup ${backupId} was not found.`);
  }

  private async writeBackupArchive(filePath: string, snapshot: BackupRestoreSnapshot) {
    const zip = new AdmZip();
    zip.addFile(
      BACKUP_SNAPSHOT_ENTRY,
      Buffer.from(JSON.stringify(snapshot, this.bigIntReplacer, 2), "utf-8"),
    );

    for (const revision of snapshot.data.revisions) {
      const sourcePath = await this.resolveRevisionUploadPath(
        revision.file_path,
        revision.file_name,
      );

      if (!sourcePath) {
        continue;
      }

      const storagePath = relative(revisionUploadsRoot, sourcePath).replace(/\\/g, "/");
      const archivePath = storagePath.startsWith("../")
        ? basename(sourcePath)
        : storagePath;
      const archiveDirectory = dirname(archivePath).replace(/\\/g, "/");
      zip.addLocalFile(
        sourcePath,
        archiveDirectory === "."
          ? BACKUP_REVISION_UPLOADS_ENTRY
          : `${BACKUP_REVISION_UPLOADS_ENTRY}/${archiveDirectory}`,
        basename(archivePath),
      );
    }

    zip.writeZip(filePath);
  }

  private async resolveRevisionUploadPath(filePath: string, fileName: string) {
    const candidates = [
      filePath && isAbsolute(filePath) ? filePath : "",
      filePath ? join(process.cwd(), filePath) : "",
      join(revisionUploadsRoot, fileName),
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        const candidateStat = await stat(candidate);
        if (candidateStat.isFile()) {
          return candidate;
        }
      } catch {
        // Try the next possible historical storage shape.
      }
    }

    return "";
  }

  private async restoreRevisionUploads(filePath: string) {
    const zip = new AdmZip(filePath);
    const entries = zip
      .getEntries()
      .filter(
        (entry) =>
          !entry.isDirectory &&
          entry.entryName.startsWith(`${BACKUP_REVISION_UPLOADS_ENTRY}/`),
      );

    ensureRevisionUploadsRoot();
    await rm(revisionUploadsRoot, { recursive: true, force: true });
    await mkdir(revisionUploadsRoot, { recursive: true });

    for (const entry of entries) {
      const relativeEntry = entry.entryName
        .slice(`${BACKUP_REVISION_UPLOADS_ENTRY}/`.length)
        .replace(/\\/g, "/");
      if (!relativeEntry || relativeEntry.split("/").includes("..")) {
        continue;
      }
      const targetPath = resolve(revisionUploadsRoot, relativeEntry);
      const uploadsPrefix = `${resolve(revisionUploadsRoot)}${sep}`;
      if (!targetPath.startsWith(uploadsPrefix)) {
        continue;
      }
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, entry.getData());
    }
  }

  private async resetUploadsData() {
    await mkdir(uploadsRoot, { recursive: true });
    await rm(revisionUploadsRoot, { recursive: true, force: true });
    await rm(batchImportUploadsRoot, { recursive: true, force: true });
    await rm(backupRestoreUploadsRoot, { recursive: true, force: true });
    ensureRevisionUploadsRoot();
  }

  private async runSeedScript() {
    const rootDir = process.cwd();
    const tsNodeCli = resolve(rootDir, "node_modules", "ts-node", "dist", "bin.js");
    const seedFile = resolve(rootDir, "prisma", "seed.ts");

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, [tsNodeCli, seedFile], {
        cwd: rootDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdErr = "";
      let stdOut = "";

      child.stdout.on("data", (chunk) => {
        stdOut += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stdErr += chunk.toString();
      });

      child.on("error", (error) => {
        rejectPromise(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        const output = [stdErr.trim(), stdOut.trim()].filter(Boolean).join("\n");
        rejectPromise(
          new BadRequestException(
            output || "Factory reset backup succeeded, but reseeding the database failed.",
          ),
        );
      });
    });
  }

  private backupIdFromFileName(fileName: string) {
    if (fileName.endsWith(BACKUP_FILE_EXTENSION)) {
      return fileName.slice(0, -BACKUP_FILE_EXTENSION.length);
    }

    if (fileName.endsWith(LEGACY_BACKUP_FILE_EXTENSION)) {
      return fileName.slice(0, -LEGACY_BACKUP_FILE_EXTENSION.length);
    }

    return fileName;
  }

  private async appendLog(entry: BackupLogItem) {
    const logPath = join(await this.ensureBackupRoot(), BACKUP_LOG_FILE);
    await writeFile(logPath, `${JSON.stringify(entry)}\n`, { flag: "a" });
  }

  private bigIntReplacer(_key: string, value: unknown) {
    return typeof value === "bigint" ? value.toString() : value;
  }
}
