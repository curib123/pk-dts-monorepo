import { systemWorkflowKey } from "../../../common/constants/system-workflow";
import { rm } from "fs/promises";
import { randomUUID } from "crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import {
  DocumentActionRequested,
  DisposalAction,
  DocumentStatus,
  DocumentType,
  DocumentWorkflowStage,
  Prisma,
  SoftcopyArtifactType,
  SoftcopyAttachmentStatus,
  WorkflowStepStatus,
} from "@prisma/client";
import { readFile, rename, stat, unlink, writeFile } from "fs/promises";
import { extname, join } from "path";
import AdmZip = require("adm-zip");
import pdf = require("pdf-parse");
import * as XLSX from "xlsx";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { toBigIntId } from "../../../common/utils/prisma-id.util";
import {
  getPagination,
  paginatedResponse,
} from "../../../common/utils/pagination.util";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  attachmentUploadsRoot,
  artifactUploadsRoot,
  buildAttachmentPublicUrl,
  buildRevisionPublicUrl,
  ensureAttachmentCategoryUploadsRoot,
  ensureArtifactUploadsRoot,
  ensureRevisionCategoryUploadsRoot,
  revisionUploadsRoot,
} from "../../../config/upload-paths";
import { BatchHardcopyUploadDto } from "./dto/batch-hardcopy-upload.dto";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { BatchHardcopyImportRowDto } from "./dto/batch-hardcopy-import.dto";
import { DisposeDocumentDto } from "./dto/dispose-document.dto";
import { DocumentAssistantQueryDto } from "./dto/document-assistant-query.dto";
import { CreateRevisionDto } from "./dto/create-revision.dto";
import { PublicDocumentQueryDto } from "./dto/public-document-query.dto";
import { PublicDocumentAssistantQueryDto } from "./dto/public-document-assistant-query.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { ConfigureDocumentApproversDto } from "./dto/configure-document-approvers.dto";
import { ReassignWorkflowStepDto } from "./dto/reassign-workflow-step.dto";
import { BatchSoftcopyFolderUploadDto } from "./dto/batch-softcopy-folder-upload.dto";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { isAdministrativeRole } from "../../../common/auth/administrative-role.util";
import {
  canManageDocuments,
  DOCUMENT_APPROVAL_PERMISSIONS,
  DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION,
  hasAnyPermission,
  hasPermission,
} from "../../../common/auth/document-workflow-permissions";
import { ElectronicDocumentStampService } from "./electronic-document-stamp.service";
import { WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode } from "../workflow-definitions/workflow-graph.types";

type ConfiguredWorkflowUser = {
  user_id: bigint;
  firstname?: string;
  lastname?: string;
  position_title?: string | null;
  role: {
    role_name: string;
    role_permissions: Array<{ permission: { permission_name: string } }>;
  };
};

type WorkflowPlanStepInput = {
  stage: DocumentWorkflowStage;
  node_key?: string;
  assigned_user_id?: string;
  assigned_role_id?: string;
  assignment_type?: string;
  required_permission?: string;
  condition_json?: Prisma.JsonValue;
  on_approve_node_key?: string;
  on_reject_node_key?: string;
  on_return_node_key?: string;
  stage_label?: string;
};

const WORKFLOW_STAGE_POLICY: Record<
  DocumentWorkflowStage,
  { label: string; permission?: string; status: DocumentStatus }
> = {
  [DocumentWorkflowStage.DRAFT]: {
    label: "Draft",
    status: DocumentStatus.Draft,
  },
  [DocumentWorkflowStage.NOTED_BY]: {
    label: "Leader / Noted By",
    permission: "document-requests.approve-noted-by",
    status: DocumentStatus.ForNotedBy,
  },
  [DocumentWorkflowStage.PLANT_MANAGER]: {
    label: "Plant Manager Approval",
    permission: "document-requests.approve-plant-manager",
    status: DocumentStatus.ForPlantManagerApproval,
  },
  [DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN]: {
    label: "Document Controller Approval",
    permission: "document-requests.approve-document-controller",
    status: DocumentStatus.ForDocumentControllerAdmin,
  },
  [DocumentWorkflowStage.HARDCOPY_APPROVAL]: {
    label: "Hardcopy Approval",
    permission: "document-requests.approve-hardcopy",
    status: DocumentStatus.ForApproval,
  },
  [DocumentWorkflowStage.COMPLETED]: {
    label: "Completed",
    status: DocumentStatus.Completed,
  },
  [DocumentWorkflowStage.CUSTOM]: {
    label: "Custom Approval",
    status: DocumentStatus.PendingApproval,
  },
};

const SOFTCOPY_ARTIFACT_GENERATOR_VERSION = "softcopy-stamp-v3";
const FINALIZED_DOCUMENT_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.Approved,
  DocumentStatus.Completed,
]);

type RevisionArtifactDownload = {
  filePath: string;
  filename: string;
  mimeType: string;
  fileSize: number;
};

const PUBLIC_DOCUMENT_SELECT = {
  document_id: true,
  document_title: true,
  document_type: true,
  status: true,
  created_at: true,
  hardcopy: {
    select: {
      asset: { select: { asset_id: true, asset_number: true } },
      area: { select: { area_id: true, area_name: true } },
      specific: {
        select: { specific_id: true, specific_name: true, area_id: true },
      },
      location: { select: { location_id: true, location_name: true } },
      sequence: { select: { sequence_id: true, sequence_code: true } },
    },
  },
  softcopy: {
    select: {
      document_number: true,
      series_number: true,
      category: {
        select: {
          softcopy_category_id: true,
          category_name: true,
          description: true,
        },
      },
      current_revision: {
        select: {
          revision_id: true,
          revision_number: true,
          file_name: true,
          mime_type: true,
          effective_date: true,
          page_number: true,
          created_at: true,
        },
      },
    },
  },
  assignments: {
    select: {
      user: {
        select: { user_id: true, firstname: true, lastname: true, username: true },
      },
      assigner: {
        select: { user_id: true, firstname: true, lastname: true, username: true },
      },
      assigned_at: true,
    },
    orderBy: { assigned_at: "asc" },
  },
} satisfies Prisma.DocumentSelect;

const PUBLIC_DOCUMENT_SUMMARY_SELECT = {
  document_id: true,
  document_title: true,
  document_type: true,
  status: true,
  created_at: true,
  hardcopy: {
    select: {
      area: { select: { area_id: true, area_name: true } },
      location: { select: { location_id: true, location_name: true } },
    },
  },
  softcopy: {
    select: {
      document_number: true,
      series_number: true,
      category: {
        select: {
          softcopy_category_id: true,
          category_name: true,
          description: true,
        },
      },
    },
  },
  assignments: {
    select: {
      user: {
        select: { user_id: true, firstname: true, lastname: true, username: true },
      },
      assigner: {
        select: { user_id: true, firstname: true, lastname: true, username: true },
      },
      assigned_at: true,
    },
    orderBy: { assigned_at: "asc" },
  },
} satisfies Prisma.DocumentSelect;

type BatchAreaReference = {
  area_id: bigint;
  area_name: string;
};

type BatchLocationReference = {
  location_id: bigint;
  location_name: string;
};

type BatchSpecificReference = {
  specific_id: bigint;
  specific_name: string;
  area_id: bigint | null;
};

type BatchSequenceReference = {
  sequence_id: bigint;
  sequence_code: string;
};

type BatchAssetReference = {
  asset_id: bigint;
  asset_number: string;
};

type FolderCategoryReference = {
  softcopy_category_id: bigint;
  category_name: string;
  folder_name: string;
  parent_category_id: bigint | null;
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly artifactBuilds = new Map<
    string,
    Promise<RevisionArtifactDownload>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly electronicDocumentStamp: ElectronicDocumentStampService = new ElectronicDocumentStampService(),
  ) {}

  async batchHardcopyImport(
    dto: BatchHardcopyUploadDto,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        "Invalid File Format: an Excel workbook upload is required.",
      );
    }

    const createdBy = toBigIntId(dto.created_by, "created_by");
    const rows = await this.parseBatchWorkbook(file.path);

    if (!rows.length) {
      throw new BadRequestException(
        "Missing Required Data: the workbook did not contain any importable hardcopy rows.",
      );
    }

    try {
      const [
        areas,
        locations,
        specifics,
        sequences,
        assets,
      ] = await this.prisma.$transaction([
        this.prisma.area.findMany({
          select: { area_id: true, area_name: true },
        }),
        this.prisma.location.findMany({
          select: { location_id: true, location_name: true },
        }),
        this.prisma.specific.findMany({
          select: { specific_id: true, specific_name: true, area_id: true },
        }),
        this.prisma.sequence.findMany({
          select: { sequence_id: true, sequence_code: true },
        }),
        this.prisma.assetNumber.findMany({
          select: { asset_id: true, asset_number: true },
        }),
      ]);

      const areaMap = new Map<string, BatchAreaReference>(
        areas.map((area) => [this.normalizeLookup(area.area_name), area]),
      );
      const locationMap = new Map<string, BatchLocationReference>(
        locations.map((location) => [
          this.normalizeLookup(location.location_name),
          location,
        ]),
      );
      const specificMap = new Map<string, BatchSpecificReference>(
        specifics.map((specific) => [
          this.buildSpecificLookupKey(specific.specific_name, specific.area_id),
          specific,
        ]),
      );
      const sequenceMap = new Map<string, BatchSequenceReference>(
        sequences.map((sequence) => [
          this.normalizeLookup(sequence.sequence_code),
          sequence,
        ]),
      );
      const assetMap = new Map<string, BatchAssetReference>(
        assets.map((asset) => [
          this.normalizeAssetLookup(asset.asset_number),
          asset,
        ]),
      );
      const processedKeys = new Set<string>();
      const results: Array<{
        row_number: number;
        sheet_name: string;
        generated_document_number: string | null;
        document_name: string;
        status: "created" | "skipped" | "error";
        message: string;
        document_id?: string;
      }> = [];

      for (const row of rows) {
        const documentTitle = this.resolveBatchDocumentTitle(row);
        const rowIdentity = this.buildBatchFingerprint(row);

        if (processedKeys.has(rowIdentity)) {
          results.push({
            row_number: row.row_number,
            sheet_name: row.sheet_name,
            generated_document_number: null,
            document_name: documentTitle,
            status: "skipped",
            message:
              "Duplicate Data: skipped because the same row data was already processed.",
          });
          continue;
        }

        processedKeys.add(rowIdentity);

        try {
          const createdDocument = await this.prisma.$transaction(async (tx) => {
            const area = await this.resolveBatchArea(
              tx,
              areaMap,
              row.area_name,
            );
            const location = await this.resolveBatchLocation(
              tx,
              locationMap,
              row.location_name,
            );
            const specific = await this.resolveBatchSpecific(
              tx,
              specificMap,
              row.specific_name,
              area.area_id,
            );
            const sequence = await this.resolveBatchSequence(
              tx,
              sequenceMap,
              row.sequence,
            );
            const asset = await this.resolveBatchAsset(
              tx,
              assetMap,
              row.asset_number,
            );
            const document = await tx.document.create({
              data: {
                document_title: documentTitle,
                document_type: DocumentType.HARDCOPY,
                status: DocumentStatus.Approved,
                legacy_imported: true,
                legacy_import_note: "Imported Hardcopy record; approval history was not recreated.",
                created_by: createdBy,
                requested_by_user_id: createdBy,
              },
            });

            await tx.hardcopyDocument.create({
              data: {
                document_id: document.document_id,
                area_id: area.area_id,
                location_id: location.location_id,
                ...(asset ? { asset_id: asset.asset_id } : {}),
                ...(specific ? { specific_id: specific.specific_id } : {}),
                ...(sequence ? { sequence_id: sequence.sequence_id } : {}),
              },
            });

            return document;
          });

          results.push({
            row_number: row.row_number,
            sheet_name: row.sheet_name,
            generated_document_number: null,
            document_name: documentTitle,
            status: "created",
            message: "Document imported successfully.",
            document_id: createdDocument.document_id.toString(),
          });
        } catch (error) {
          results.push({
            row_number: row.row_number,
            sheet_name: row.sheet_name,
            generated_document_number: null,
            document_name: documentTitle,
            status: "error",
            message: this.extractBatchErrorMessage(error),
          });
        }
      }

      return {
        summary: {
          total: results.length,
          created: results.filter((result) => result.status === "created")
            .length,
          skipped: results.filter((result) => result.status === "skipped")
            .length,
          errors: results.filter((result) => result.status === "error").length,
        },
        results,
      };
    } finally {
      await this.deleteUploadedBatchFile(file.path);
    }
  }

  async batchSoftcopyFolderImport(
    dto: BatchSoftcopyFolderUploadDto,
    files: Express.Multer.File[] = [],
  ) {
    let relativePaths: string[];
    try {
      relativePaths = JSON.parse(dto.relative_paths) as string[];
    } catch {
      throw new BadRequestException("Folder paths must be a valid JSON array.");
    }
    if (
      !files.length ||
      !Array.isArray(relativePaths) ||
      relativePaths.length !== files.length
    ) {
      throw new BadRequestException(
        "Select one folder and keep every uploaded file path intact.",
      );
    }

    const createdBy = toBigIntId(dto.created_by, "created_by");
    const categories = await this.prisma.softcopyCategory.findMany({
      select: {
        softcopy_category_id: true,
        category_name: true,
        folder_name: true,
        parent_category_id: true,
      },
    });
    const categoryMap = new Map(
      categories.map((category) => [
        this.folderCategoryKey(
          category.parent_category_id,
          category.category_name,
        ),
        category,
      ]),
    );
    const results: Array<{
      relative_path: string;
      document_id?: string;
      document_number?: string | null;
      category_path: string;
      status: "created" | "error";
      message: string;
    }> = [];

    for (const [index, file] of files.entries()) {
      const relativePath = String(relativePaths[index] ?? "").replace(
        /\\/g,
        "/",
      );
      const parts = relativePath
        .split("/")
        .map((part) => part.trim())
        .filter((part) => part && part !== "." && part !== "..");
      const directoryParts = parts.slice(0, -1);
      try {
        if (!directoryParts.length)
          throw new BadRequestException(
            "Every file must belong to the selected folder.",
          );
        const category = await this.resolveFolderCategoryPath(
          directoryParts,
          categoryMap,
        );
        const originalBaseName = (parts.at(-1) || file.originalname).replace(
          /\.[^.]+$/,
          "",
        );
        const metadata = await this.analyzeFileContent(
          await readFile(file.path),
          parts.at(-1) || file.originalname,
          file.mimetype,
        );
        const documentTitle =
          metadata.document_title ||
          originalBaseName
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase() ||
          "UNTITLED SOFTCOPY";
        const storedFilePath = await this.moveRevisionUpload(
          file,
          category.folder_name,
        );
        try {
          const document = await this.prisma.$transaction(async (tx) => {
            const created = await tx.document.create({
              data: {
                document_title: documentTitle,
                document_type: DocumentType.SOFTCOPY,
                status: DocumentStatus.Approved,
                legacy_imported: true,
                legacy_import_note: "Imported Softcopy record; approval history was not recreated.",
                created_by: createdBy,
                requested_by_user_id: createdBy,
              },
            });
            const softcopy = await tx.softcopyDocument.create({
              data: {
                document_id: created.document_id,
                document_number: metadata.document_number,
                softcopy_category_id: category.softcopy_category_id,
              },
            });
            const revision = await tx.documentRevision.create({
              data: {
                softcopy_id: softcopy.softcopy_id,
                revision_number: "000",
                file_name: parts.at(-1) || file.originalname,
                file_path: storedFilePath,
                file_size: BigInt(file.size),
                mime_type: file.mimetype,
                uploaded_by: createdBy,
                document_title: documentTitle,
                is_current: true,
                approved_at: created.created_at,
              },
            });
            await tx.softcopyDocument.update({
              where: { softcopy_id: softcopy.softcopy_id },
              data: { current_revision_id: revision.revision_id },
            });
            return created;
          });
          results.push({
            relative_path: relativePath,
            document_id: document.document_id.toString(),
            document_number: metadata.document_number,
            category_path: category.folder_name,
            status: "created",
            message: "Softcopy imported successfully.",
          });
        } catch (error) {
          await unlink(storedFilePath).catch(() => undefined);
          throw error;
        }
      } catch (error) {
        await unlink(file.path).catch(() => undefined);
        results.push({
          relative_path: relativePath,
          category_path: directoryParts.join(" / "),
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unexpected folder import failure.",
        });
      }
    }

    return {
      summary: {
        total: results.length,
        created: results.filter((result) => result.status === "created").length,
        errors: results.filter((result) => result.status === "error").length,
      },
      results,
    };
  }

  async assistantSearch(
    dto: DocumentAssistantQueryDto,
    user: AuthenticatedUser,
  ) {
    const query = dto.query.trim();
    const limit = dto.limit ?? 8;

    if (!query) {
      throw new BadRequestException("Search query is required.");
    }

    const documents = (await this.prisma.document.findMany({
      where: this.documentAccessWhere(user),
      select: {
        document_id: true,
        document_title: true,
        document_type: true,
        status: true,
        requested_by_name: true,
        disposal_remarks: true,
        disposed_at: true,
        disposed_by_name: true,
        requester: {
          select: {
            user_id: true,
            firstname: true,
            lastname: true,
          },
        },
        disposer: {
          select: {
            user_id: true,
            firstname: true,
            lastname: true,
          },
        },
        created_at: true,
        hardcopy: {
          select: {
            asset: {
              select: {
                asset_id: true,
                asset_number: true,
              },
            },
            area: {
              select: {
                area_id: true,
                area_name: true,
              },
            },
            specific: {
              select: {
                specific_id: true,
                specific_name: true,
                area_id: true,
              },
            },
            location: {
              select: {
                location_id: true,
                location_name: true,
              },
            },
            sequence: {
              select: {
                sequence_id: true,
                sequence_code: true,
              },
            },
          },
        },
        softcopy: {
          select: {
            document_number: true,
            category: {
              select: {
                softcopy_category_id: true,
                category_name: true,
                folder_name: true,
              },
            },
            current_revision: {
              select: {
                revision_id: true,
                revision_number: true,
                file_name: true,
                file_path: true,
                created_at: true,
              },
            },
          },
        },
        creator: {
          select: {
            user_id: true,
            firstname: true,
            lastname: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: 250,
    })).map((document) => this.withApiDocumentNumber(document));

    const matches = documents
      .map((document) => ({
        document,
        score: this.scoreDocumentMatch(document, query),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.document);

    const localSummary = matches.length
      ? `Found ${matches.length} matching document${
          matches.length === 1 ? "" : "s"
        } for "${query}".`
      : `No direct document matches were found for "${query}".`;

    const requestedMode = dto.mode ?? "online";
    const aiSummary =
      requestedMode === "local"
        ? {
            configured: false,
            provider: "local",
            answer: this.localAssistantFallback(query, matches),
          }
        : await this.buildAssistantSummary(query, matches);

    return {
      mode: requestedMode,
      provider: aiSummary.provider === "mistral" ? "mistral" : "local-search",
      configured: aiSummary.configured,
      usedFallback:
        requestedMode === "online" && aiSummary.provider !== "mistral",
      answer: aiSummary.answer || localSummary,
      matches: this.withRevisionUrls(matches),
    };
  }

  async findPublicDocuments(
    query: PublicDocumentQueryDto,
    user: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where = this.publicDocumentWhere(query, user);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: PUBLIC_DOCUMENT_SUMMARY_SELECT,
        orderBy: [{ created_at: "desc" }, { document_id: "desc" }],
      }),
      this.prisma.document.count({ where }),
    ]);

    return paginatedResponse(
      items.map((item) => this.withApiDocumentNumber(item)),
      total,
      page,
      limit,
    );
  }

  async publicAssistantSearch(dto: PublicDocumentAssistantQueryDto) {
    const query = dto.query.trim();
    const limit = dto.limit ?? 12;

    if (!query) {
      throw new BadRequestException("Search query is required.");
    }

    const documents = (await this.prisma.document.findMany({
      where: {
        status: DocumentStatus.Approved,
        ...(dto.type ? { document_type: dto.type } : {}),
      },
      select: PUBLIC_DOCUMENT_SELECT,
      orderBy: { created_at: "desc" },
      take: 250,
    })).map((document) => this.withApiDocumentNumber(document));

    const matches = documents
      .map((document) => ({
        document,
        score: this.scoreDocumentMatch(document, query),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.document);

    const aiSummary = await this.buildAssistantSummary(query, matches, true);

    return {
      provider: aiSummary.provider === "mistral" ? "mistral" : "local-search",
      configured: aiSummary.configured,
      usedFallback: aiSummary.provider !== "mistral",
      answer: aiSummary.answer,
      suggestions: this.publicAssistantSuggestions(matches),
      matches,
    };
  }

  async findPublicDocument(id: string, user: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({
      where: {
        document_id: toBigIntId(id, "document_id"),
        status: DocumentStatus.Approved,
        ...this.documentAccessWhere(user),
      },
      select: PUBLIC_DOCUMENT_SELECT,
    });

    if (!document) {
      throw new NotFoundException("Public document was not found.");
    }

    return this.withApiDocumentNumber(document);
  }

  private publicDocumentWhere(
    query: PublicDocumentQueryDto,
    user: AuthenticatedUser,
  ): Prisma.DocumentWhereInput {
    const terms = (query.query ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6);

    return {
      status: DocumentStatus.Approved,
      ...this.documentAccessWhere(user),
      ...(query.type ? { document_type: query.type } : {}),
      ...(terms.length
        ? {
            AND: terms.map((term) => ({
              OR: [
                {
                  softcopy: {
                    is: {
                      document_number: {
                        contains: term,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
                {
                  document_title: {
                    contains: term,
                    mode: "insensitive" as const,
                  },
                },
                {
                  hardcopy: {
                    is: {
                      area: {
                        is: {
                          area_name: {
                            contains: term,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                },
                {
                  hardcopy: {
                    is: {
                      location: {
                        is: {
                          location_name: {
                            contains: term,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                },
                {
                  hardcopy: {
                    is: {
                      asset: {
                        is: {
                          asset_number: {
                            contains: term,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                },
                {
                  softcopy: {
                    is: {
                      category: {
                        is: {
                          category_name: {
                            contains: term,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                },
                {
                  softcopy: {
                    is: {
                      current_revision: {
                        is: {
                          file_name: {
                            contains: term,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                },
              ],
            })),
          }
        : {}),
    };
  }

  async findAll(
    query: PaginationQueryDto,
    statuses: DocumentStatus[] = [DocumentStatus.Approved],
    user?: AuthenticatedUser,
  ) {
    const { page, limit, skip, take } = getPagination(query);
    const where: Prisma.DocumentWhereInput = {
      status: { in: statuses },
      ...this.documentAccessWhere(user),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip,
        take,
        select: {
          document_id: true,
          document_title: true,
          document_type: true,
          status: true,
          requested_by_name: true,
          disposal_remarks: true,
          disposal_action: true,
          disposal_action_other: true,
          disposed_at: true,
          disposed_by_name: true,
          requester: {
            select: {
              user_id: true,
              firstname: true,
              lastname: true,
            },
          },
          disposer: {
            select: {
              user_id: true,
              firstname: true,
              lastname: true,
            },
          },
          created_at: true,
          hardcopy: {
            select: {
              hardcopy_id: true,
              created_at: true,
              retention_enabled: true,
              retention_start_date: true,
              retention_end_date: true,
              asset: {
                select: {
                  asset_id: true,
                  asset_number: true,
                },
              },
              area: {
                select: {
                  area_id: true,
                  area_name: true,
                },
              },
              specific: {
                select: {
                  specific_id: true,
                  specific_name: true,
                  area_id: true,
                },
              },
              location: {
                select: {
                  location_id: true,
                  location_name: true,
                },
              },
              sequence: {
                select: {
                  sequence_id: true,
                  sequence_code: true,
                },
              },
            },
          },
          softcopy: {
            select: {
              document_number: true,
              softcopy_id: true,
              created_at: true,
              category: {
                select: {
                  softcopy_category_id: true,
                  category_name: true,
                  folder_name: true,
                },
              },
              current_revision: {
                select: {
                  revision_id: true,
                  revision_number: true,
                  file_name: true,
                  file_path: true,
                  created_at: true,
                },
              },
            },
          },
          creator: {
            select: {
              user_id: true,
              firstname: true,
              lastname: true,
            },
          },
          assignments: {
            select: {
              user: {
                select: {
                  user_id: true,
                  firstname: true,
                  lastname: true,
                  username: true,
                },
              },
              assigner: {
                select: {
                  user_id: true,
                  firstname: true,
                  lastname: true,
                  username: true,
                },
              },
              assigned_at: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      }),
      this.prisma.document.count({ where }),
    ]);

    return paginatedResponse(
      items.map((item) => this.withApiDocumentNumber(this.withHardcopyRetention(item))),
      total,
      page,
      limit,
    );
  }

  findOne(
    id: string,
    user?: AuthenticatedUser,
    additionalWhere?: Prisma.DocumentWhereInput,
  ) {
    const accessWhere: Prisma.DocumentWhereInput = {
      document_id: toBigIntId(id, "document_id"),
      ...this.documentAccessWhere(user),
    };

    return this.prisma.document
      .findFirst({
        where: additionalWhere
          ? { AND: [accessWhere, additionalWhere] }
          : accessWhere,
        include: {
          requester: {
            select: {
              user_id: true,
              firstname: true,
              lastname: true,
            },
          },
          disposer: {
            select: {
              user_id: true,
              firstname: true,
              lastname: true,
            },
          },
          creator: { select: { user_id: true, firstname: true, lastname: true, username: true, position_title: true } },
          hardcopy: {
            include: {
              asset: true,
              area: true,
              specific: true,
              location: true,
              sequence: true,
              attachments: {
                orderBy: { created_at: "desc" },
                include: {
                  uploader: {
                    select: { user_id: true, firstname: true, lastname: true },
                  },
                },
              },
            },
          },
          softcopy: {
            include: {
              category: true,
              current_revision: {
                include: {
                  uploader: {
                    select: {
                      user_id: true,
                      firstname: true,
                      lastname: true,
                    },
                  },
                  approver: {
                    select: {
                      user_id: true,
                      firstname: true,
                      lastname: true,
                    },
                  },
                },
              },
              revisions: {
                orderBy: { created_at: "desc" },
                include: {
                  uploader: {
                    select: {
                      user_id: true,
                      firstname: true,
                      lastname: true,
                    },
                  },
                  approver: {
                    select: {
                      user_id: true,
                      firstname: true,
                      lastname: true,
                    },
                  },
                },
              },
              attachments: {
                orderBy: { created_at: "desc" },
                include: {
                  uploader: {
                    select: { user_id: true, firstname: true, lastname: true },
                  },
                },
              },
            },
          },
          assignments: {
            include: {
              user: {
                select: {
                  user_id: true,
                  firstname: true,
                  lastname: true,
                  username: true,
                },
              },
              assigner: {
                select: {
                  user_id: true,
                  firstname: true,
                  lastname: true,
                  username: true,
                },
              },
            },
            orderBy: { assigned_at: "asc" },
          },
          approver_configuration: {
            select: {
              workflow_name: true,
              workflow_version: true,
            },
          },
          workflow_steps: {
            orderBy: { sequence: "asc" },
            include: {
              assignee: {
                select: {
                  user_id: true,
                  firstname: true,
                  lastname: true,
                  username: true,
                  position_title: true,
                },
              },
              actor: {
                select: {
                  user_id: true,
                  firstname: true,
                  lastname: true,
                  username: true,
                  position_title: true,
                },
              },
              assignment_history: {
                orderBy: { changed_at: "desc" },
              },
            },
          },
        },
      })
      .then((document) => this.withApiDocumentNumber(this.withHardcopyRetention(this.withRevisionUrls(document))));
  }

  async createRequest(
    dto: CreateDocumentDto,
    actorUserId: string,
    file?: Express.Multer.File,
    actor?: AuthenticatedUser,
  ) {
    const directCreate = dto.direct_create === true || dto.direct_create === "true";
    if (dto.document_type === DocumentType.SOFTCOPY && !dto.document_number?.trim()) {
      throw new BadRequestException("Document Number is required for every Softcopy document.");
    }
    if (dto.document_type === DocumentType.SOFTCOPY && !dto.series_number?.trim()) {
      throw new BadRequestException("Series Number is required for every Softcopy document.");
    }
    if (dto.document_type === DocumentType.SOFTCOPY) {
      await this.assertDocumentSeriesAvailable(dto.document_number!, dto.series_number!);
    }
    if (directCreate) {
      if (dto.document_type !== DocumentType.SOFTCOPY) {
        throw new BadRequestException("Direct creation is supported for Softcopy documents only.");
      }
      if (!actor || !hasPermission(actor, "documents.create-direct")) {
        throw new ForbiddenException("You are not authorized to create a Softcopy directly without a Document Control Request.");
      }
      if (!dto.direct_creation_reason?.trim()) {
        throw new BadRequestException("A reason is required for direct Softcopy creation.");
      }
      if (!file) {
        throw new BadRequestException("A controlled file is required for direct Softcopy creation.");
      }
      if (dto.action !== "SUBMIT") {
        throw new BadRequestException("Direct Softcopy creation must be submitted as a controlled copy; save as draft is not available for this action.");
      }
      if (!dto.series_number?.trim() || !dto.page_number?.trim() || !dto.new_effective_date) {
        throw new BadRequestException("Direct Softcopy creation requires a Document Number, revision effectivity date, series number, and page number.");
      }
    } else if (file && dto.document_type === DocumentType.SOFTCOPY) {
      throw new ConflictException("Revision files can be uploaded only after the Document Control Request completes all required approvals.");
    }
    const selectedWorkflow = await this.loadDefaultWorkflowVersion(dto.document_type, dto.action_requested);
    if (!selectedWorkflow) throw new ConflictException("No active system-default approval workflow is published. Ask an administrator to publish it in Workflow Builder.");
    if (dto.workflow_version_id && dto.workflow_version_id !== selectedWorkflow.workflow_version_id.toString()) {
      throw new BadRequestException("Only the current system-default published workflow can be selected for this request. Reload the workflow selection.");
    }
    const workflowPlan = selectedWorkflow
      ? this.workflowGraphToPlan(selectedWorkflow.graph, dto)
      : this.parseWorkflowPlan(
          dto.workflow_plan,
          dto.document_type,
          dto.action_requested ?? DocumentActionRequested.CREATE,
        );
    if (
      dto.workflow_plan &&
      actor &&
      !hasAnyPermission(actor, [DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION]) &&
      !this.isAdministrativeRole(actor.role.role_name)
    ) {
      throw new ForbiddenException(
        "You do not have permission to customize document approval workflows.",
      );
    }
    if (
      dto.document_type === DocumentType.HARDCOPY &&
      (!dto.area_id || !dto.location_id)
    ) {
      throw new BadRequestException(
        "Hardcopy documents require area_id and location_id.",
      );
    }

    if (file && dto.document_type !== DocumentType.SOFTCOPY) {
      throw new BadRequestException(
        "An initial file can only be uploaded for softcopy documents.",
      );
    }

    if (
      dto.document_type === DocumentType.HARDCOPY &&
      dto.document_number?.trim()
    ) {
      throw new BadRequestException(
        "Hardcopy records do not use a Document Number. Use the document title and storage classification.",
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const createdBy = toBigIntId(actorUserId, "current_user_id");
        const status = directCreate
          ? DocumentStatus.Completed
          : dto.action === "SUBMIT"
          ? this.workflowStatusForStage(workflowPlan[0].stage)
          : DocumentStatus.Draft;
        const manualRequester = dto.document_type === DocumentType.SOFTCOPY && dto.requester_type === "MANUAL_NAME";
        if (manualRequester && !dto.requested_by_name?.trim()) {
          throw new BadRequestException(
            "Requested by name is required for a manual requester.",
          );
        }
        const documentData: Prisma.DocumentUncheckedCreateInput = {
          document_title: dto.document_title.trim().toUpperCase(),
          document_type: dto.document_type,
          created_by: createdBy,
          requested_by_user_id: manualRequester ? null : createdBy,
          requested_by_name: manualRequester
            ? dto.requested_by_name!.trim()
            : null,
          request_date: new Date(),
          creation_source: directCreate ? "DIRECT" : "DCR",
          creation_reason: directCreate ? dto.direct_creation_reason!.trim() : null,
          direct_created_at: directCreate ? new Date() : null,
          workflow_version_id: selectedWorkflow?.workflow_version_id ?? null,
          workflow_snapshot: selectedWorkflow?.graph as Prisma.InputJsonValue | undefined,
          workflow_current_node_key: directCreate ? null : workflowPlan[0]?.node_key ?? null,
          ...(dto.document_type === DocumentType.SOFTCOPY
            ? {
                department: dto.department?.trim() || null,
                business_document_type: dto.business_document_type,
                action_requested: dto.action_requested ?? DocumentActionRequested.CREATE,
                from_party: dto.from_party?.trim() || null,
                to_party: dto.to_party?.trim() || null,
                reason_for_change: dto.reason_for_change,
                brief_description: dto.brief_description?.trim() || null,
                proposed_change: dto.proposed_change?.trim() || null,
                revision_level_from: dto.revision_level_from?.trim() || null,
                revision_level_to: dto.revision_level_to?.trim() || null,
                previous_effective_date: dto.previous_effective_date ? new Date(dto.previous_effective_date) : null,
                new_effective_date: dto.new_effective_date ? new Date(dto.new_effective_date) : null,
                date_received: status === DocumentStatus.Draft ? null : new Date(),
                date_released: directCreate ? new Date() : null,
                approval_date: directCreate ? new Date() : null,
              }
            : {}),
          ...this.buildWorkflowStateCreateData(status, {}),
        };

        const document = await tx.document.create({
          data: documentData,
        });
        await tx.documentApproverConfiguration.create({
          data: {
            document_id: document.document_id,
            configured_by_user_id: createdBy,
            workflow_name: selectedWorkflow?.workflow_definition.name || dto.workflow_name?.trim() || this.defaultWorkflowName(dto.document_type, dto.action_requested),
            workflow_version: selectedWorkflow?.version_number ?? this.parseWorkflowVersion(dto.workflow_version),
            workflow_plan: workflowPlan as unknown as Prisma.InputJsonValue,
          },
        });
        let assignmentIds = [createdBy];
        if (actor && canManageDocuments(actor) && dto.assigned_user_ids) {
          try {
            const selected = JSON.parse(dto.assigned_user_ids) as string[];
            assignmentIds = [...new Set(selected.map((id) => toBigIntId(id, "assigned_user_id")))];
          } catch { throw new BadRequestException("Selected assignees are invalid."); }
        }
        if (assignmentIds.length) await tx.documentAssignment.createMany({ data: assignmentIds.map((userId) => ({ document_id: document.document_id, user_id: userId, assigned_by: createdBy })) });
        await tx.documentStatusHistory.create({
          data: {
            document_id: document.document_id,
            previous_status: null,
            new_status: status,
            action: status === DocumentStatus.Draft ? "save-draft" : "submit",
            performed_by: createdBy,
          },
        });

        if (status !== DocumentStatus.Draft && !directCreate) {
          await this.initializeWorkflowSteps(tx, document.document_id, createdBy, dto.document_type);
        }

        if (dto.document_type === DocumentType.HARDCOPY) {
          const route = await this.resolveHardcopyStorageRoute(tx, {
            area_id: dto.area_id!,
            specific_id: dto.specific_id,
            asset_id: dto.asset_id,
            location_id: dto.location_id!,
          });
          const hardcopyData: Prisma.HardcopyDocumentUncheckedCreateInput = {
            document_id: document.document_id,
            ...route,
            ...this.resolveRetentionData(dto),
            ...(dto.sequence_id
              ? { sequence_id: toBigIntId(dto.sequence_id, "sequence_id") }
              : {}),
          };

          const hardcopy = await tx.hardcopyDocument.create({ data: hardcopyData });
        } else {
          const softcopyCategoryId = await this.resolveSoftcopyCategoryId(
            tx,
            dto.softcopy_category_id,
          );
          if (file) {
            const softcopy = await tx.softcopyDocument.create({
              data: {
                document_id: document.document_id,
                document_number: dto.document_number?.trim() || null,
                series_number: dto.series_number?.trim() || null,
                softcopy_category_id: softcopyCategoryId,
              },
              include: { category: true },
            });
            const revisionNumber = dto.initial_revision_number?.trim() || "000";
            const storedFilePath = await this.moveRevisionUpload(
              file,
              softcopy.category.folder_name,
            );
            const revision = await tx.documentRevision.create({
              data: {
                revision_number: revisionNumber,
                file_name: file.originalname,
                file_path: storedFilePath,
                file_size: BigInt(file.size),
                mime_type: file.mimetype,
                softcopy_id: softcopy.softcopy_id,
                uploaded_by: createdBy,
                document_title: document.document_title,
                series_number: dto.series_number?.trim() || null,
                page_number: dto.page_number?.trim() || null,
                effective_date: dto.new_effective_date ? new Date(dto.new_effective_date) : null,
                revision_level_from: dto.revision_level_from?.trim() || null,
                revision_level_to: dto.revision_level_to?.trim() || null,
                previous_effective_date: dto.previous_effective_date ? new Date(dto.previous_effective_date) : null,
                new_effective_date: dto.new_effective_date ? new Date(dto.new_effective_date) : null,
                date_received: status === DocumentStatus.Draft ? null : new Date(),
                date_released: directCreate ? new Date() : null,
                approval_date: directCreate ? new Date() : null,
                is_current: directCreate,
                is_historical: false,
                approved_by_user_id: directCreate ? createdBy : null,
                approved_at: directCreate ? new Date() : null,
              },
            });
            if (directCreate) {
              await tx.softcopyDocument.update({
                where: { softcopy_id: softcopy.softcopy_id },
                data: { current_revision_id: revision.revision_id },
              });
            }
          } else {
            const softcopy = await tx.softcopyDocument.create({
              data: {
                document_id: document.document_id,
                document_number: dto.document_number?.trim() || null,
                series_number: dto.series_number?.trim() || null,
                softcopy_category_id: softcopyCategoryId,
              },
            });
          }
        }

        return tx.document.findUnique({
          where: { document_id: document.document_id },
          include: {
            hardcopy: {
              include: {
                asset: true,
                area: true,
                specific: true,
                location: true,
                sequence: true,
              },
            },
            softcopy: {
              include: {
                category: true,
                current_revision: {
                  include: {
                    uploader: {
                      select: {
                        user_id: true,
                        firstname: true,
                        lastname: true,
                      },
                    },
                  },
                },
                revisions: {
                  orderBy: { created_at: "desc" },
                  include: {
                    uploader: {
                      select: {
                        user_id: true,
                        firstname: true,
                        lastname: true,
                      },
                    },
                  },
                },
              },
            },
            creator: { select: { user_id: true, firstname: true, lastname: true, username: true, position_title: true } },
            requester: {
              select: {
                user_id: true,
                firstname: true,
                lastname: true,
              },
            },
            disposer: {
              select: {
                user_id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        });
      });
    } catch (error) {
      this.rethrowDocumentNumberConflict(error);
    }
  }

  async analyzeUpload(file?: Express.Multer.File) {
    if (!file?.buffer) {
      throw new BadRequestException("A file is required for analysis.");
    }

    return this.analyzeFileContent(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  private async analyzeFileContent(
    buffer: Buffer,
    originalName: string,
    mimeType = "",
  ) {
    const extension = originalName.split(".").pop()?.toLowerCase() ?? "";
    let text = "";

    try {
      if (extension === "pdf" || mimeType === "application/pdf") {
        text = (await pdf(buffer)).text;
      } else if (extension === "docx") {
        text = this.extractDocxText(buffer);
      } else if (["txt", "csv", "md", "rtf"].includes(extension)) {
        text = buffer.toString("utf8");
      } else if (["xlsx", "xls"].includes(extension)) {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        text = workbook.SheetNames.map((name) =>
          XLSX.utils.sheet_to_csv(workbook.Sheets[name]),
        ).join("\n");
      } else {
        return {
          document_number: null,
          document_title: null,
          detected: false,
          message: "Content reading is not supported for this file type.",
        };
      }
    } catch {
      return {
        document_number: null,
        document_title: null,
        detected: false,
        message:
          "The file content could not be read. Scanned PDFs may require OCR.",
      };
    }

    const normalizedText = text.replace(/\u00a0/g, " ");
    const documentNumber = normalizedText.match(
      /\b(?:document|doc)\s*(?:no\.?|number|#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i,
    )?.[1];
    const documentTitle = normalizedText
      .match(/\b(?:document\s*)?title\s*[:.\-]\s*([^\r\n]{3,255})/i)?.[1]
      ?.trim();

    return {
      document_number: documentNumber?.toUpperCase() ?? null,
      document_title: documentTitle?.toUpperCase() ?? null,
      detected: !!documentNumber,
      message: documentNumber
        ? "Document number read from the file content."
        : "No labeled document number was found in the readable file content.",
    };
  }

  async findMyRequests(userId: string, query: PaginationQueryDto) {
    return this.findScopedRequests(
      {
        created_by: toBigIntId(userId, "current_user_id"),
        status: { notIn: [DocumentStatus.Approved, DocumentStatus.Completed] },
      },
      query,
      true,
    );
  }

  private approvalQueueWhere(actor: AuthenticatedUser): Prisma.DocumentWhereInput {
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    return {
        OR: [
          {
            workflow_steps: {
              some: { assigned_user_id: actorId, status: WorkflowStepStatus.PENDING },
            },
            status: {
              in: [
                DocumentStatus.ForNotedBy,
                DocumentStatus.ForPlantManagerApproval,
                DocumentStatus.ForDocumentControllerAdmin,
                DocumentStatus.ForApproval,
                DocumentStatus.PendingApproval,
              ],
            },
          },
          {
            status: DocumentStatus.Approved,
            reviewed_by_user_id: actorId,
          },
        ],
      };
  }

  async findApprovalQueue(query: PaginationQueryDto, actor: AuthenticatedUser) {
    return this.findScopedRequests(this.approvalQueueWhere(actor), query);
  }

  async findApprovalDocument(id: string, actor: AuthenticatedUser) {
    const document = await this.findOne(
      id,
      undefined,
      this.approvalQueueWhere(actor),
    );
    if (!document) {
      throw new NotFoundException(
        "This document is no longer assigned to your approval queue.",
      );
    }
    return document;
  }

  private async initializeWorkflowSteps(
    tx: Prisma.TransactionClient,
    documentId: bigint,
    creatorId: bigint,
    documentType: DocumentType,
  ) {
    const [creator, document] = await Promise.all([
      tx.user.findUnique({
        where: { user_id: creatorId },
        select: { leader_id: true },
      }),
      tx.document.findUnique({
        where: { document_id: documentId },
        select: { action_requested: true, business_document_type: true, requested_by_name: true, workflow_snapshot: true },
      }),
    ]);
    const configured = await tx.documentApproverConfiguration.findUnique({
      where: { document_id: documentId },
    });
    const plan = document?.workflow_snapshot ? this.workflowGraphToPlan(document.workflow_snapshot, {
      document_type: documentType,
      action_requested: document.action_requested,
      business_document_type: document.business_document_type ?? undefined,
      requester_type: document.requested_by_name ? "MANUAL_NAME" : "CURRENT_USER",
    } as CreateDocumentDto) : this.parseWorkflowPlan(
      configured?.workflow_plan,
      documentType,
      document?.action_requested ?? DocumentActionRequested.CREATE,
    );
    const resolvedSteps: Array<WorkflowPlanStepInput & {
      assignedUserId: bigint;
      assignmentSource: string;
    }> = [];

    for (const plannedStep of plan) {
      let assignedUserId = plannedStep.assigned_user_id
        ? toBigIntId(plannedStep.assigned_user_id, "workflow_assigned_user_id")
        : null;
      let assignmentSource = assignedUserId ? "NAMED_USER_OVERRIDE" : "";

      if (!assignedUserId && plannedStep.assignment_type === "REQUESTER_LEADER") {
        assignedUserId = creator?.leader_id ?? null;
        assignmentSource = "REQUESTER_LEADER";
      }
      if (!assignedUserId && plannedStep.assignment_type === "ROLE" && plannedStep.assigned_role_id) {
        const fallback = await this.findUserByRoleId(
          tx,
          toBigIntId(plannedStep.assigned_role_id, "workflow_assigned_role_id"),
          creatorId,
        );
        assignedUserId = fallback?.user_id ?? null;
        assignmentSource = "WORKFLOW_ROLE";
      }
      if (!assignedUserId && plannedStep.assignment_type === "PERMISSION" && plannedStep.required_permission) {
        const fallback = await this.findUserByPermission(tx, plannedStep.required_permission, creatorId);
        assignedUserId = fallback?.user_id ?? null;
        assignmentSource = "WORKFLOW_PERMISSION";
      }

      if (!assignedUserId && !plannedStep.assignment_type && plannedStep.stage === DocumentWorkflowStage.NOTED_BY) {
        assignedUserId = configured?.noted_by_user_id ?? creator?.leader_id ?? null;
        assignmentSource = configured?.noted_by_user_id
          ? "DOCUMENT_CONFIGURATION"
          : "REQUESTER_LEADER";
      }
      if (!assignedUserId && !plannedStep.assignment_type && plannedStep.stage === DocumentWorkflowStage.PLANT_MANAGER) {
        const fallback = configured?.plant_manager_user_id
          ? { user_id: configured.plant_manager_user_id }
          : await this.findUserByRole(tx, ["PLANT_MANAGER", "Plant Manager"]);
        assignedUserId = fallback?.user_id ?? null;
        assignmentSource = configured?.plant_manager_user_id
          ? "DOCUMENT_CONFIGURATION"
          : "ROLE_FALLBACK";
      }
      if (!assignedUserId && !plannedStep.assignment_type && plannedStep.stage === DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN) {
        const fallback = configured?.document_controller_user_id
          ? { user_id: configured.document_controller_user_id }
          : await this.findUserByRole(tx, [
              "Admin",
              "DOCUMENT_CONTROLLER",
              "DOCUMENT CONTROLLER",
              "Documentation Officer", "Document Controller",
              "Document Controller Officer",
              "ADMIN",
              "Administrator",
            ]);
        assignedUserId = fallback?.user_id ?? null;
        assignmentSource = configured?.document_controller_user_id
          ? "DOCUMENT_CONFIGURATION"
          : "ROLE_FALLBACK";
      }
      if (!assignedUserId && !plannedStep.assignment_type && plannedStep.stage === DocumentWorkflowStage.HARDCOPY_APPROVAL) {
        const fallback = configured?.hardcopy_approver_user_id
          ? { user_id: configured.hardcopy_approver_user_id }
          : await this.findUserByRole(tx, [
              "Admin",
              "ADMIN",
              "Administrator",
              "DOCUMENT_CONTROLLER",
              "DOCUMENT CONTROLLER",
              "Documentation Officer", "Document Controller",
              "Document Controller Officer",
              "Plant Manager",
              "PLANT_MANAGER",
            ]);
        assignedUserId = fallback?.user_id ?? null;
        assignmentSource = configured?.hardcopy_approver_user_id
          ? "DOCUMENT_CONFIGURATION"
          : "ROLE_FALLBACK";
      }

      if (!assignedUserId) {
        throw new BadRequestException(
          `${this.workflowStageLabel(plannedStep.stage)} does not have an eligible approver. Configure a named approver before submitting.`,
        );
      }
      resolvedSteps.push({
        ...plannedStep,
        assignedUserId,
        assignmentSource,
      });
    }

    const workflowUserIds = resolvedSteps.map((step) => step.assignedUserId);
    const workflowUsers = await tx.user.findMany({
      where: { user_id: { in: [...new Set(workflowUserIds)] } },
      select: {
        user_id: true,
        firstname: true,
        lastname: true,
        position_title: true,
        role: {
          select: {
            role_name: true,
            role_permissions: {
              select: { permission: { select: { permission_name: true } } },
            },
          },
        },
      },
    });
    const workflowUsersById = new Map(workflowUsers.map((workflowUser) => [workflowUser.user_id.toString(), workflowUser]));

    for (const step of resolvedSteps) {
      const isRequesterLeaderNotedBy =
        step.stage === DocumentWorkflowStage.NOTED_BY &&
        step.assignmentSource === "REQUESTER_LEADER";
      const isExplicitWorkflowAssignment = this.isExplicitWorkflowAssignment(step.assignment_type);
      if (!isExplicitWorkflowAssignment && !isRequesterLeaderNotedBy) {
        this.assertApproverForStage(
          workflowUsersById,
          step.assignedUserId.toString(),
          step.stage,
        );
      }
      const assignedUser = workflowUsersById.get(step.assignedUserId.toString());
      if (!assignedUser) throw new BadRequestException("The configured workflow approver no longer exists.");
      if (step.assignedUserId === creatorId) throw new BadRequestException(`${step.stage_label || this.workflowStageLabel(step.stage)} cannot be assigned to the request creator.`);
      if (step.required_permission && (!isExplicitWorkflowAssignment || step.assignment_type === "PERMISSION")) {
        const user = assignedUser;
        const permissions = user.role.role_permissions.map(
          ({ permission }) => permission.permission_name,
        );
        if (!(isRequesterLeaderNotedBy && step.required_permission === "document-requests.approve-noted-by") && !this.isAdministrativeRole(user.role.role_name) && !permissions.includes(step.required_permission)) {
          throw new BadRequestException(
            `${this.workflowUserName(user)} does not have the ${step.required_permission} permission required by ${step.stage_label || this.workflowStageLabel(step.stage)}.`,
          );
        }
      }
    }

    await tx.documentWorkflowStep.createMany({
      data: resolvedSteps.map((step, index) => {
        const user = workflowUsersById.get(step.assignedUserId.toString())!;
        return {
        document_id: documentId,
        stage: step.stage,
        node_key: step.node_key ?? `legacy-${index + 1}`,
        stage_label: step.stage_label?.trim() || this.workflowStageLabel(step.stage),
        sequence: index + 1,
        assigned_user_id: step.assignedUserId,
        assignment_source: step.assignmentSource,
        assignment_type: step.assignment_type ?? (step.assigned_user_id ? "USER" : "LEGACY"),
        assigned_role_id: step.assigned_role_id
          ? toBigIntId(step.assigned_role_id, "workflow_assigned_role_id")
          : null,
        required_permission: step.assignment_type === "PERMISSION"
          ? step.required_permission ?? null
          : step.assignment_type
            ? null
            : step.required_permission ?? WORKFLOW_STAGE_POLICY[step.stage].permission ?? null,
        condition_json: step.condition_json ?? undefined,
        on_approve_node_key: step.on_approve_node_key ?? null,
        on_reject_node_key: step.on_reject_node_key ?? null,
        on_return_node_key: step.on_return_node_key ?? null,
        assigned_user_name_snapshot: this.workflowUserName(user),
        assigned_position_title_snapshot: user.position_title?.trim() || null,
        status: index === 0 ? WorkflowStepStatus.PENDING : WorkflowStepStatus.QUEUED,
      };}),
    });

    await tx.document.update({
      where: { document_id: documentId },
      data: { workflow_current_node_key: resolvedSteps[0]?.node_key ?? "legacy-1" },
    });

    return resolvedSteps;
  }

  private async findUserByRole(
    tx: Prisma.TransactionClient,
    roleNames: string[],
  ) {
    return tx.user.findFirst({
      where: { role: { role_name: { in: roleNames } } },
      select: { user_id: true },
      orderBy: { user_id: "asc" },
    });
  }

  private async findUserByRoleId(tx: Prisma.TransactionClient, roleId: bigint, creatorId: bigint) {
    return tx.user.findFirst({
      where: { role_id: roleId, user_id: { not: creatorId } },
      select: { user_id: true },
      orderBy: { user_id: "asc" },
    });
  }

  private async findUserByPermission(tx: Prisma.TransactionClient, permissionName: string, creatorId: bigint) {
    return tx.user.findFirst({
      where: {
        user_id: { not: creatorId },
        role: {
          role_permissions: {
            some: { permission: { permission_name: permissionName } },
          },
        },
      },
      select: { user_id: true },
      orderBy: { user_id: "asc" },
    });
  }

  private async loadDefaultWorkflowVersion(documentType: DocumentType, action?: DocumentActionRequested, database: Prisma.TransactionClient = this.prisma) {
    const key = systemWorkflowKey(documentType, action);
    return database.workflowVersion.findFirst({
      where: { status: "PUBLISHED", workflow_definition: { workflow_key: key, is_active: true } },
      include: { workflow_definition: true },
      orderBy: { version_number: "desc" },
    });
  }

  private async loadPublishedWorkflowVersion(id: string, documentType: DocumentType, database: Prisma.TransactionClient = this.prisma) {
    const version = await database.workflowVersion.findFirst({
      where: {
        workflow_version_id: toBigIntId(id, "workflow_version_id"),
        status: "PUBLISHED",
        workflow_definition: {
          is_active: true,
          OR: [{ document_type: documentType }, { document_type: null }],
        },
      },
      include: { workflow_definition: true },
    });
    if (!version) {
      throw new BadRequestException("Select an active published workflow that supports this document type.");
    }
    return version;
  }

  private workflowGraphToPlan(graphValue: Prisma.JsonValue, dto: CreateDocumentDto): WorkflowPlanStepInput[] {
    const graph = graphValue as unknown as WorkflowGraph;
    if (graph?.schema_version !== 2 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new BadRequestException("The selected workflow version does not contain a supported graph.");
    }
    const nodesByKey = new Map(graph.nodes.map((node) => [node.key, node]));
    const edgeFor = (key: string, outcome: WorkflowGraphEdge["outcome"]) => {
      const matching = graph.edges.filter((edge) => edge.from === key && edge.outcome === outcome && this.workflowConditionsMatch(edge.conditions ?? [], dto));
      if (matching.length > 1) throw new BadRequestException(`Workflow node ${key} has multiple matching ${outcome} paths.`);
      return matching[0];
    };
    const targetsFor = (key: string) => ({
      APPROVE: edgeFor(key, "APPROVE") ?? edgeFor(key, "DEFAULT"),
      REJECT: edgeFor(key, "REJECT"),
      RETURN: edgeFor(key, "RETURN"),
    });
    const reachable = new Set<string>();
    const traversalOrder: string[] = [];
    const queue = [graph.start_node_key];
    while (queue.length) {
      const key = queue.shift()!;
      if (reachable.has(key)) continue;
      reachable.add(key);
      traversalOrder.push(key);
      if (nodesByKey.get(key)?.type === "APPROVAL") {
        const targets = targetsFor(key);
        if (!targets.APPROVE && graph.edges.some((edge) => edge.from === key && ["APPROVE", "DEFAULT"].includes(edge.outcome))) {
          throw new BadRequestException(`No approval path matches this request at ${nodesByKey.get(key)!.label}. Configure a default path in Workflow Builder.`);
        }
        Object.values(targets).forEach((edge) => { if (edge) queue.push(edge.to); });
      }
    }
    const approvalNodes = traversalOrder
      .map((key) => nodesByKey.get(key))
      .filter((node): node is WorkflowGraphNode => node?.type === "APPROVAL");
    if (!approvalNodes.length || nodesByKey.get(graph.start_node_key)?.type !== "APPROVAL") {
      throw new BadRequestException("A document workflow must start with at least one approval node.");
    }
    const targetFor = (node: WorkflowGraphNode, outcome: "APPROVE" | "REJECT" | "RETURN") => {
      const target = targetsFor(node.key)[outcome]?.to;
      return target && nodesByKey.get(target)?.type === "APPROVAL" ? target : undefined;
    };
    return approvalNodes.map((node) => ({
      stage: Object.values(DocumentWorkflowStage).includes(node.stage as DocumentWorkflowStage)
        ? node.stage as DocumentWorkflowStage
        : DocumentWorkflowStage.CUSTOM,
      node_key: node.key,
      stage_label: node.label,
      assignment_type: node.assignment?.type,
      assigned_user_id: node.assignment?.type === "USER" ? node.assignment.user_id : undefined,
      assigned_role_id: node.assignment?.type === "ROLE" ? node.assignment.role_id : undefined,
      required_permission: node.assignment?.type === "PERMISSION" ? node.assignment.permission : undefined,
      on_approve_node_key: targetFor(node, "APPROVE"),
      on_reject_node_key: targetFor(node, "REJECT"),
      on_return_node_key: targetFor(node, "RETURN"),
      condition_json: graph.edges.filter((edge) => edge.from === node.key && edge.conditions?.length) as unknown as Prisma.JsonValue,
    }));
  }

  private workflowConditionsMatch(conditions: Array<{ field: string; operator: string; value: string | string[] }>, dto: CreateDocumentDto) {
    const values: Record<string, string> = {
      document_type: dto.document_type,
      action_requested: dto.action_requested ?? DocumentActionRequested.CREATE,
      business_document_type: dto.business_document_type ?? "",
      requester_type: dto.requester_type ?? "CURRENT_USER",
    };
    return conditions.every((condition) => {
      const actual = values[condition.field] ?? "";
      if (condition.operator === "EQUALS") return actual === condition.value;
      if (condition.operator === "NOT_EQUALS") return actual !== condition.value;
      return Array.isArray(condition.value) && condition.value.includes(actual);
    });
  }

  private parseWorkflowPlan(
    value: string | Prisma.JsonValue | null | undefined,
    documentType: DocumentType,
    actionRequested: DocumentActionRequested,
  ): WorkflowPlanStepInput[] {
    if (value === null || value === undefined || value === "") {
      return this.defaultWorkflowPlan(documentType, actionRequested);
    }

    let parsed: unknown = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new BadRequestException("The workflow plan is not valid JSON.");
      }
    }
    const isVersionedGraphPlan = Array.isArray(parsed) && parsed.some((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate) && "node_key" in candidate);
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > (isVersionedGraphPlan ? 50 : 6)) {
      throw new BadRequestException(
        `A workflow plan must contain between one and ${isVersionedGraphPlan ? 50 : 6} approval stages.`,
      );
    }

    if (documentType === DocumentType.HARDCOPY && !isVersionedGraphPlan) {
      const hardcopyPlan = parsed as Array<Record<string, unknown>>;
      if (
        hardcopyPlan.length !== 1 ||
        hardcopyPlan[0]?.stage !== DocumentWorkflowStage.HARDCOPY_APPROVAL
      ) {
        throw new BadRequestException(
          "A Hardcopy workflow must contain exactly one Hardcopy Approval stage.",
        );
      }
    }

    const allowedStages = new Set<DocumentWorkflowStage>(
      isVersionedGraphPlan
        ? [DocumentWorkflowStage.NOTED_BY, DocumentWorkflowStage.PLANT_MANAGER, DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN, DocumentWorkflowStage.HARDCOPY_APPROVAL, DocumentWorkflowStage.CUSTOM]
        : documentType === DocumentType.SOFTCOPY
        ? [
            DocumentWorkflowStage.NOTED_BY,
            DocumentWorkflowStage.PLANT_MANAGER,
            DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN,
          ]
        : [DocumentWorkflowStage.HARDCOPY_APPROVAL],
    );
    const seen = new Set<DocumentWorkflowStage>();
    return parsed.map((candidate, index) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        throw new BadRequestException(`Workflow stage ${index + 1} is invalid.`);
      }
      const record = candidate as Record<string, unknown>;
      const stage = record.stage as DocumentWorkflowStage;
      if (!allowedStages.has(stage)) {
        throw new BadRequestException(
          `Workflow stage ${String(record.stage || index + 1)} is not allowed for ${documentType}.`,
        );
      }
      if (!isVersionedGraphPlan && seen.has(stage)) {
        throw new BadRequestException(
          `${this.workflowStageLabel(stage)} can appear only once in a request workflow.`,
        );
      }
      seen.add(stage);
      const assignedUserId = record.assigned_user_id;
      if (
        assignedUserId !== undefined &&
        assignedUserId !== null &&
        typeof assignedUserId !== "string"
      ) {
        throw new BadRequestException(
          `The assigned user for workflow stage ${index + 1} is invalid.`,
        );
      }
      const stageLabel = record.stage_label;
      if (stageLabel !== undefined && typeof stageLabel !== "string") {
        throw new BadRequestException(`Workflow stage ${index + 1} has an invalid label.`);
      }
      const optionalString = (key: string) => {
        const value = record[key];
        if (value !== undefined && value !== null && typeof value !== "string") {
          throw new BadRequestException(`Workflow stage ${index + 1} has an invalid ${key}.`);
        }
        return typeof value === "string" && value.trim() ? value.trim() : undefined;
      };
      return {
        stage,
        ...(optionalString("node_key") ? { node_key: optionalString("node_key") } : {}),
        ...(assignedUserId ? { assigned_user_id: assignedUserId.trim() } : {}),
        ...(optionalString("assigned_role_id") ? { assigned_role_id: optionalString("assigned_role_id") } : {}),
        ...(optionalString("assignment_type") ? { assignment_type: optionalString("assignment_type") } : {}),
        ...(optionalString("required_permission") ? { required_permission: optionalString("required_permission") } : {}),
        ...(optionalString("on_approve_node_key") ? { on_approve_node_key: optionalString("on_approve_node_key") } : {}),
        ...(optionalString("on_reject_node_key") ? { on_reject_node_key: optionalString("on_reject_node_key") } : {}),
        ...(optionalString("on_return_node_key") ? { on_return_node_key: optionalString("on_return_node_key") } : {}),
        ...(record.condition_json !== undefined ? { condition_json: record.condition_json as Prisma.JsonValue } : {}),
        ...(stageLabel?.trim()
          ? { stage_label: stageLabel.trim().slice(0, 150) }
          : {}),
      };
    });
  }

  private defaultWorkflowPlan(
    documentType: DocumentType,
    actionRequested: DocumentActionRequested,
  ): WorkflowPlanStepInput[] {
    if (documentType === DocumentType.HARDCOPY) {
      return [{ stage: DocumentWorkflowStage.HARDCOPY_APPROVAL }];
    }
    if (actionRequested === DocumentActionRequested.CANCELLATION) {
      return [
        { stage: DocumentWorkflowStage.NOTED_BY },
        { stage: DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN },
      ];
    }
    return [
      { stage: DocumentWorkflowStage.NOTED_BY },
      { stage: DocumentWorkflowStage.PLANT_MANAGER },
      { stage: DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN },
    ];
  }

  private workflowStageLabel(stage: DocumentWorkflowStage) {
    return WORKFLOW_STAGE_POLICY[stage]?.label ?? stage.replace(/_/g, " ");
  }

  private isExplicitWorkflowAssignment(assignmentType?: string) {
    return !!assignmentType && assignmentType !== "LEGACY";
  }

  private workflowStatusForStage(stage: DocumentWorkflowStage) {
    return WORKFLOW_STAGE_POLICY[stage]?.status ?? DocumentStatus.PendingApproval;
  }

  private defaultWorkflowName(
    documentType: DocumentType,
    actionRequested?: DocumentActionRequested,
  ) {
    if (documentType === DocumentType.HARDCOPY) return "Direct Hardcopy Approval";
    return actionRequested === DocumentActionRequested.CANCELLATION
      ? "Softcopy Cancellation Approval"
      : "Standard Softcopy Approval";
  }

  private parseWorkflowVersion(value?: string) {
    if (!value) return 1;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9999) {
      throw new BadRequestException("Workflow version must be between 1 and 9999.");
    }
    return parsed;
  }

  private workflowUserName(user: { firstname?: string; lastname?: string }) {
    return [user.firstname, user.lastname].filter(Boolean).join(" ").trim() || "Unknown user";
  }

  private assertApproverForStage(
    usersById: Map<string, ConfiguredWorkflowUser>,
    userId: string,
    stage: DocumentWorkflowStage,
  ) {
    if (stage === DocumentWorkflowStage.NOTED_BY) {
      return this.assertConfiguredApprover(usersById, userId, "Noted By", [
        "document-requests.approve-noted-by",
      ]);
    }
    if (stage === DocumentWorkflowStage.PLANT_MANAGER) {
      return this.assertConfiguredApprover(
        usersById,
        userId,
        "Plant Manager",
        ["document-requests.approve-plant-manager"],
        ["plant manager", "plant_manager", "plant-manager"],
      );
    }
    if (stage === DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN) {
      return this.assertConfiguredApprover(
        usersById,
        userId,
        "Document Controller/Admin",
        ["document-requests.approve-document-controller"],
        [
          "admin",
          "administrator",
          "super admin",
          "superadmin",
          "super-admin",
          "documentation officer", "document controller",
          "document_controller",
          "document controller officer",
          "document_controller_officer",
          "document controller/admin",
        ],
      );
    }
    if (stage === DocumentWorkflowStage.HARDCOPY_APPROVAL) {
      return this.assertConfiguredApprover(
        usersById,
        userId,
        "Hardcopy",
        ["document-requests.approve-hardcopy"],
        [
          "admin",
          "administrator",
          "super admin",
          "superadmin",
          "super-admin",
          "documentation officer", "document controller",
          "document_controller",
          "document controller officer",
          "document_controller_officer",
          "document controller/admin",
          "plant manager",
          "plant_manager",
          "plant-manager",
        ],
      );
    }
  }

  private assertConfiguredApprover(
    usersById: Map<string, ConfiguredWorkflowUser>,
    userId: string | undefined,
    label: string,
    requiredPermissions: readonly string[],
    allowedRoles?: readonly string[],
  ) {
    if (!userId) return;
    const user = usersById.get(userId);
    if (!user) {
      throw new BadRequestException(`${label} approver was not found.`);
    }
    const roleName = user.role.role_name.trim().toLowerCase();
    if (allowedRoles && !isAdministrativeRole(roleName) && !allowedRoles.includes(roleName)) {
      throw new BadRequestException(`${label} approver must have an approved ${label} role.`);
    }
    if (!isAdministrativeRole(roleName)) {
      const permissions = new Set(user.role.role_permissions.map((link) => link.permission.permission_name));
      if (!requiredPermissions.some((permission) => permissions.has(permission))) {
        throw new BadRequestException(`${label} approver does not have the required workflow permission.`);
      }
    }
  }

  async getApproverConfiguration(documentId: string) {
    return this.prisma.documentApproverConfiguration.findUnique({
      where: { document_id: toBigIntId(documentId, "document_id") },
      include: {
        document_owner: { select: { user_id: true, firstname: true, lastname: true, username: true } },
        configured_by: { select: { user_id: true, firstname: true, lastname: true, username: true } },
      },
    });
  }

  async setApproverConfiguration(
    documentId: string,
    dto: ConfigureDocumentApproversDto,
    actor: AuthenticatedUser,
  ) {
    if (!this.isAdministrativeRole(actor.role.role_name)) {
      throw new ForbiddenException("Only an administrator can configure document approvers.");
    }
    const parsedDocumentId = toBigIntId(documentId, "document_id");
    const document = await this.prisma.document.findUnique({
      where: { document_id: parsedDocumentId },
      select: {
        document_id: true,
        document_type: true,
        action_requested: true,
        status: true,
      },
    });
    if (!document) throw new NotFoundException("Document not found.");
    if (dto.workflow_plan !== undefined && document.status !== DocumentStatus.Draft) {
      throw new ConflictException(
        "The workflow definition is locked after submission. Reassign a pending step with an audit reason instead.",
      );
    }

    const workflowPlan = dto.workflow_plan !== undefined
      ? this.parseWorkflowPlan(
          dto.workflow_plan,
          document.document_type,
          document.action_requested,
        )
      : undefined;

    const values = [
      dto.noted_by_user_id,
      dto.plant_manager_user_id,
      dto.document_controller_user_id,
      dto.hardcopy_approver_user_id,
      dto.access_approver_user_id,
      dto.document_owner_user_id,
    ].filter((value): value is string => value !== undefined && value !== "");
    const userIds = [...new Set(values.map((value) => toBigIntId(value, "approver_user_id")))];
    if (userIds.length) {
      const configuredUsers = await this.prisma.user.findMany({
        where: { user_id: { in: userIds } },
        select: {
          user_id: true,
          role: {
            select: {
              role_name: true,
              role_permissions: {
                select: { permission: { select: { permission_name: true } } },
              },
            },
          },
        },
      });
      if (configuredUsers.length !== userIds.length) {
        throw new BadRequestException("One or more configured approvers do not exist.");
      }
      const byId = new Map(configuredUsers.map((configuredUser) => [configuredUser.user_id.toString(), configuredUser]));
      this.assertConfiguredApprover(byId, dto.noted_by_user_id, "Noted By", ["document-requests.approve-noted-by"]);
      this.assertConfiguredApprover(byId, dto.plant_manager_user_id, "Plant Manager", ["document-requests.approve-plant-manager"], ["plant manager", "plant_manager", "plant-manager"]);
      this.assertConfiguredApprover(byId, dto.document_controller_user_id, "Document Controller/Admin", ["document-requests.approve-document-controller"], ["admin", "administrator", "super admin", "superadmin", "super-admin", "documentation officer", "document controller", "document_controller", "document controller officer", "document_controller_officer", "document controller/admin"]);
      this.assertConfiguredApprover(byId, dto.hardcopy_approver_user_id, "Hardcopy", ["document-requests.approve-hardcopy"], ["admin", "administrator", "super admin", "superadmin", "super-admin", "documentation officer", "document controller", "document_controller", "document controller officer", "document_controller_officer", "document controller/admin", "plant manager", "plant_manager", "plant-manager"]);
      this.assertConfiguredApprover(byId, dto.access_approver_user_id, "Document Access", ["document-access-requests.approve"]);
      this.assertConfiguredApprover(byId, dto.document_owner_user_id, "Document Owner", ["document-access-requests.approve"]);
    }
    const data = {
      noted_by_user_id: dto.noted_by_user_id !== undefined ? dto.noted_by_user_id ? toBigIntId(dto.noted_by_user_id, "noted_by_user_id") : null : undefined,
      plant_manager_user_id: dto.plant_manager_user_id !== undefined ? dto.plant_manager_user_id ? toBigIntId(dto.plant_manager_user_id, "plant_manager_user_id") : null : undefined,
      document_controller_user_id: dto.document_controller_user_id !== undefined ? dto.document_controller_user_id ? toBigIntId(dto.document_controller_user_id, "document_controller_user_id") : null : undefined,
      hardcopy_approver_user_id: dto.hardcopy_approver_user_id !== undefined ? dto.hardcopy_approver_user_id ? toBigIntId(dto.hardcopy_approver_user_id, "hardcopy_approver_user_id") : null : undefined,
      access_approver_user_id: dto.access_approver_user_id !== undefined ? dto.access_approver_user_id ? toBigIntId(dto.access_approver_user_id, "access_approver_user_id") : null : undefined,
      document_owner_user_id: dto.document_owner_user_id !== undefined ? dto.document_owner_user_id ? toBigIntId(dto.document_owner_user_id, "document_owner_user_id") : null : undefined,
      workflow_name: dto.workflow_name !== undefined
        ? dto.workflow_name.trim() || this.defaultWorkflowName(document.document_type, document.action_requested)
        : undefined,
      workflow_version: dto.workflow_version,
      workflow_plan: workflowPlan
        ? workflowPlan as unknown as Prisma.InputJsonValue
        : undefined,
    };
    return this.prisma.documentApproverConfiguration.upsert({
      where: { document_id: parsedDocumentId },
      create: {
        document_id: parsedDocumentId,
        configured_by_user_id: toBigIntId(actor.user_id, "current_user_id"),
        noted_by_user_id: data.noted_by_user_id ?? null,
        plant_manager_user_id: data.plant_manager_user_id ?? null,
        document_controller_user_id: data.document_controller_user_id ?? null,
        hardcopy_approver_user_id: data.hardcopy_approver_user_id ?? null,
        access_approver_user_id: data.access_approver_user_id ?? null,
        document_owner_user_id: data.document_owner_user_id ?? null,
        workflow_name: data.workflow_name ?? this.defaultWorkflowName(document.document_type, document.action_requested),
        workflow_version: data.workflow_version ?? 1,
        workflow_plan: data.workflow_plan ?? this.defaultWorkflowPlan(document.document_type, document.action_requested) as unknown as Prisma.InputJsonValue,
      },
      update: {
        ...data,
        configured_by_user_id: toBigIntId(actor.user_id, "current_user_id"),
      },
    });
  }

  async reassignWorkflowStep(
    documentIdValue: string,
    workflowStepIdValue: string,
    dto: ReassignWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    if (
      !this.isAdministrativeRole(actor.role.role_name) &&
      !hasAnyPermission(actor, [DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION])
    ) {
      throw new ForbiddenException(
        "You do not have permission to reassign document approvers.",
      );
    }
    const documentId = toBigIntId(documentIdValue, "document_id");
    const workflowStepId = toBigIntId(workflowStepIdValue, "workflow_step_id");
    const newUserId = toBigIntId(dto.user_id, "approver_user_id");
    const changedByUserId = toBigIntId(actor.user_id, "current_user_id");

    return this.prisma.$transaction(async (tx) => {
      const step = await tx.documentWorkflowStep.findFirst({
        where: {
          workflow_step_id: workflowStepId,
          document_id: documentId,
        },
        include: {
          assignee: {
            select: { firstname: true, lastname: true },
          },
        },
      });
      if (!step) throw new NotFoundException("Workflow step was not found.");
      if (step.status !== WorkflowStepStatus.PENDING) {
        throw new ConflictException("Only a pending approval step can be reassigned.");
      }

      const newUser = await tx.user.findUnique({
        where: { user_id: newUserId },
        select: {
          user_id: true,
          firstname: true,
          lastname: true,
          position_title: true,
          role: {
            select: {
              role_name: true,
              role_permissions: {
                select: {
                  permission: { select: { permission_name: true } },
                },
              },
            },
          },
        },
      });
      if (!newUser) throw new BadRequestException("The replacement approver was not found.");
      if (step.required_permission) {
        if (!this.isAdministrativeRole(newUser.role.role_name) && !newUser.role.role_permissions.some(({ permission }) => permission.permission_name === step.required_permission)) {
          throw new BadRequestException(`The replacement approver needs ${step.required_permission}.`);
        }
      } else this.assertApproverForStage(
        new Map([[newUser.user_id.toString(), newUser]]),
        newUser.user_id.toString(),
        step.stage,
      );

      const newUserName = this.workflowUserName(newUser);
      await tx.documentWorkflowAssignmentHistory.create({
        data: {
          workflow_step_id: step.workflow_step_id,
          previous_user_id: step.assigned_user_id,
          new_user_id: newUser.user_id,
          changed_by_user_id: changedByUserId,
          previous_user_name:
            step.assigned_user_name_snapshot ||
            (step.assignee ? this.workflowUserName(step.assignee) : null),
          new_user_name: newUserName,
          new_position_title: newUser.position_title?.trim() || null,
          reason: dto.reason.trim(),
        },
      });
      return tx.documentWorkflowStep.update({
        where: { workflow_step_id: step.workflow_step_id },
        data: {
          assigned_user_id: newUser.user_id,
          assignment_source: "ADMIN_REASSIGNMENT",
          assigned_user_name_snapshot: newUserName,
          assigned_position_title_snapshot: newUser.position_title?.trim() || null,
          assigned_at: new Date(),
        },
        include: {
          assignee: {
            select: {
              user_id: true,
              firstname: true,
              lastname: true,
              username: true,
              position_title: true,
            },
          },
          assignment_history: { orderBy: { changed_at: "desc" } },
        },
      });
    });
  }

  private async findScopedRequests(
    where: Prisma.DocumentWhereInput,
    query: PaginationQueryDto,
    prioritizeForRevision = false,
  ) {
    const { page, limit, skip, take } = getPagination(query);
    const publicUser = { select: { user_id: true, firstname: true, lastname: true, username: true, position_title: true } } as const;
    const include: Prisma.DocumentInclude = {
      creator: publicUser,
      requester: publicUser,
      reviewer: publicUser,
      status_history: {
        orderBy: { created_at: "desc" },
        include: { actor: publicUser },
      },
      approver_configuration: true,
      workflow_steps: { orderBy: { sequence: "asc" }, include: { assignee: { select: { user_id: true, firstname: true, lastname: true } } } },
      hardcopy: {
        include: {
          asset: true,
          area: true,
          specific: true,
          location: true,
          sequence: true,
        },
      },
      softcopy: { include: { category: true, current_revision: true } },
    };
    const total = await this.prisma.document.count({ where });
    if (!prioritizeForRevision) {
      const items = await this.prisma.document.findMany({
        where,
        skip,
        take,
        orderBy: { updated_at: "desc" },
        include,
      });
      return paginatedResponse(
        items.map((item) => this.withApiDocumentNumber(this.withHardcopyRetention(item))),
        total,
        page,
        limit,
      );
    }

    const revisionWhere: Prisma.DocumentWhereInput = {
      AND: [where, { status: { in: [DocumentStatus.ForRevision, DocumentStatus.ReturnedForCorrection] } }],
    };
    const otherWhere: Prisma.DocumentWhereInput = {
      AND: [where, { status: { notIn: [DocumentStatus.ForRevision, DocumentStatus.ReturnedForCorrection] } }],
    };
    const revisionTotal = await this.prisma.document.count({ where: revisionWhere });
    const revisionTake = Math.min(take, Math.max(0, revisionTotal - skip));
    const revisionItems = revisionTake > 0
      ? await this.prisma.document.findMany({
          where: revisionWhere,
          skip,
          take: revisionTake,
          orderBy: { updated_at: "desc" },
          include,
        })
      : [];
    const otherTake = take - revisionItems.length;
    const otherItems = otherTake > 0
      ? await this.prisma.document.findMany({
          where: otherWhere,
          skip: Math.max(0, skip - revisionTotal),
          take: otherTake,
          orderBy: { updated_at: "desc" },
          include,
        })
      : [];
    const items = [...revisionItems, ...otherItems].map((item) =>
      this.withApiDocumentNumber(this.withHardcopyRetention(item)),
    );
    return paginatedResponse(items, total, page, limit);
  }

  async updateRequest(id: string, dto: UpdateDocumentDto, actorUserId: string, actor?: AuthenticatedUser) {
    const existing = await this.prisma.document.findUnique({
      where: { document_id: toBigIntId(id, "document_id") },
    });
    if (!existing) return null;
    if (existing.created_by !== toBigIntId(actorUserId, "current_user_id"))
      throw new ForbiddenException(
        "Only the request creator can edit this request.",
      );
    const editableStatuses: DocumentStatus[] = [
      DocumentStatus.Draft,
      DocumentStatus.ReturnedForCorrection,
      DocumentStatus.ForRevision,
    ];
    if (!editableStatuses.includes(existing.status)) {
      throw new ConflictException(
        "Only draft or revision-requested records can be edited.",
      );
    }
    return this.update(id, { ...dto, action: undefined }, actor);
  }

  async updateOwned(id: string, dto: UpdateDocumentDto, actor: AuthenticatedUser) {
    const documentId = toBigIntId(id, "document_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    const owned = await this.prisma.document.findFirst({
      where: {
        document_id: documentId,
        OR: [
          { created_by: actorId },
          { assignments: { some: { user_id: actorId } } },
        ],
      },
      select: { document_id: true },
    });
    if (!owned) throw new ForbiddenException("Staff can only manage documents they created or that are assigned to them.");
    return this.update(id, { ...dto, action: undefined }, actor);
  }

  async transition(
    id: string,
    actorUserId: string,
    action: "submit" | "approve" | "request-revision" | "reject" | "cancel" | "complete",
    remarks?: string,
    actor?: AuthenticatedUser,
  ) {
    if (action === "request-revision" && !remarks?.trim()) {
      throw new BadRequestException("A reason is required when returning a request for revision.");
    }
    const documentId = toBigIntId(id, "document_id");
    const actorId = toBigIntId(actorUserId, "current_user_id");
    const attachmentFilesToRemove: string[] = [];
    const transitionedDocument = await this.prisma.$transaction(async (tx) => {
      const current = await tx.document.findUnique({
        where: { document_id: documentId },
        include: {
          workflow_steps: { orderBy: { sequence: "asc" } },
          assignments: { select: { user_id: true } },
        },
      });
      if (!current) return null;
      const originalNodeKey = current.workflow_current_node_key;
      const pendingStep = current.workflow_steps.find(
        (candidate) =>
          candidate.status === WorkflowStepStatus.PENDING &&
          (!current.workflow_current_node_key || candidate.node_key === current.workflow_current_node_key),
      ) ?? current.workflow_steps.find(
        (candidate) => candidate.status === WorkflowStepStatus.PENDING,
      );
      const builderDecision = !!current.workflow_version_id && !!pendingStep &&
        ["approve", "reject", "request-revision"].includes(action) && !FINALIZED_DOCUMENT_STATUSES.has(current.status);
      const canReturnAssignedWorkflowStep = action === "request-revision" &&
        !!actor &&
        !!pendingStep &&
        pendingStep.assigned_user_id === actorId &&
        !FINALIZED_DOCUMENT_STATUSES.has(current.status);

      let receivedAt: Date | null = null;
      let releasedAt: Date | null = null;

      if (actor) {
        const actionPermission = action === "submit"
          ? "document-requests.submit"
          : action === "cancel"
            ? "document-requests.edit"
            : action === "request-revision"
              ? "document-requests.request-revision"
              : action === "reject"
                ? "document-requests.reject"
                : undefined;
        if (actionPermission && !builderDecision && !canReturnAssignedWorkflowStep && !hasAnyPermission(actor, [actionPermission])) {
          throw new ForbiddenException("You do not have permission to perform this request action.");
        }
      }

      if (actor && (action === "approve" || builderDecision)) {
        if (current.created_by === actorId) throw new ForbiddenException("A request creator cannot approve their own request.");
        const isRequesterLeaderNotedBy =
          pendingStep?.stage === DocumentWorkflowStage.NOTED_BY &&
          pendingStep.assignment_source === "REQUESTER_LEADER" &&
          pendingStep.required_permission === "document-requests.approve-noted-by";
        const isExplicitWorkflowAssignment = this.isExplicitWorkflowAssignment(
          pendingStep?.assignment_type ?? undefined,
        );
        const stagePermissions = isExplicitWorkflowAssignment && pendingStep?.assignment_type !== "PERMISSION"
          ? []
          : pendingStep?.required_permission
          ? [pendingStep.required_permission]
          : pendingStep?.stage === DocumentWorkflowStage.NOTED_BY
              ? [DOCUMENT_APPROVAL_PERMISSIONS[0]]
          : pendingStep?.stage === DocumentWorkflowStage.PLANT_MANAGER
            ? [DOCUMENT_APPROVAL_PERMISSIONS[1]]
            : pendingStep?.stage === DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN
              ? [DOCUMENT_APPROVAL_PERMISSIONS[2]]
              : pendingStep?.stage === DocumentWorkflowStage.HARDCOPY_APPROVAL
                ? [DOCUMENT_APPROVAL_PERMISSIONS[3]]
                : [];
        if (!isRequesterLeaderNotedBy && stagePermissions.length && !hasAnyPermission(actor, stagePermissions)) {
          throw new ForbiddenException("You do not have permission to approve this workflow stage.");
        }
      }
      if (actor && action === "complete" && !hasAnyPermission(actor, ["document-requests.complete"])) {
        throw new ForbiddenException("You do not have permission to complete this request.");
      }

      if (["submit", "cancel"].includes(action) && current.created_by !== actorId)
        throw new ForbiddenException(
          "Only the request creator can perform this request action.",
        );

      let nextStatus: DocumentStatus;
      let step: (typeof current.workflow_steps)[number] | undefined;
      if (action === "submit") {
        const editableStatuses = new Set<DocumentStatus>([
          DocumentStatus.Draft,
          DocumentStatus.ForRevision,
          DocumentStatus.ReturnedForCorrection,
        ]);
        if (!editableStatuses.has(current.status)) {
          throw new ConflictException(`Cannot submit a ${current.status} request.`);
        }
        let firstStage = current.workflow_steps[0]?.stage;
        let firstNodeKey = current.workflow_steps[0]?.node_key ?? null;
        if (!current.workflow_steps.length) {
          const initialized = await this.initializeWorkflowSteps(
            tx,
            documentId,
            actorId,
            current.document_type,
          );
          firstStage = initialized[0]?.stage;
          firstNodeKey = initialized[0]?.node_key ?? "legacy-1";
        } else {
          await tx.documentWorkflowStep.updateMany({
            where: { document_id: documentId },
            data: {
              status: WorkflowStepStatus.QUEUED,
              acted_by_user_id: null,
              acted_at: null,
              acted_user_name_snapshot: null,
              acted_position_title_snapshot: null,
              decision: null,
              comments: null,
            },
          });
          await tx.documentWorkflowStep.update({
            where: { workflow_step_id: current.workflow_steps[0].workflow_step_id },
            data: { status: WorkflowStepStatus.PENDING },
          });
        }
        if (!firstStage) {
          throw new ConflictException("The request does not have an approval workflow.");
        }
        nextStatus = this.workflowStatusForStage(firstStage);
        current.workflow_current_node_key = firstNodeKey;
        if (current.document_type === DocumentType.SOFTCOPY) {
          receivedAt = current.date_received ?? new Date();
          await tx.documentRevision.updateMany({
            where: {
              softcopy: { document_id: documentId },
              approved_at: null,
              date_received: null,
            },
            data: { date_received: receivedAt },
          });
        }
      } else if (action === "cancel") {
        const nonCancellableStatuses = new Set<DocumentStatus>([
          DocumentStatus.Approved,
          DocumentStatus.Completed,
          DocumentStatus.Disposed,
          DocumentStatus.Cancelled,
        ]);
        if (nonCancellableStatuses.has(current.status)) {
          throw new ConflictException(`Cannot cancel a ${current.status} document.`);
        }
        nextStatus = DocumentStatus.Cancelled;
        current.workflow_current_node_key = null;
      } else if (action === "complete") {
        if (current.status !== DocumentStatus.Approved) {
          throw new ConflictException("Only an approved request can be completed.");
        }
        if (current.document_type === DocumentType.SOFTCOPY) {
          const softcopy = await tx.softcopyDocument.findUnique({
            where: { document_id: documentId },
            select: { current_revision_id: true },
          });
          if (!softcopy?.current_revision_id) {
            throw new ConflictException("Upload and finalize the approved Softcopy revision before completing this request.");
          }
        }
        const finalStep = current.workflow_steps
          .filter((candidate) => candidate.status === WorkflowStepStatus.APPROVED)
          .sort((left, right) => (right.acted_at?.getTime() ?? 0) - (left.acted_at?.getTime() ?? 0))[0];
        if (actor && (!finalStep || finalStep.assigned_user_id !== actorId)) {
          throw new ForbiddenException("Only the configured final approver can complete this request.");
        }
        nextStatus = DocumentStatus.Completed;
        current.workflow_current_node_key = null;
        releasedAt = new Date();
        if (current.document_type === DocumentType.SOFTCOPY) {
          const softcopy = await tx.softcopyDocument.findUnique({
            where: { document_id: documentId },
            select: { current_revision_id: true },
          });
          if (softcopy?.current_revision_id) {
            await tx.documentRevision.update({
              where: { revision_id: softcopy.current_revision_id },
              data: { date_released: releasedAt },
            });
          }
        }
      } else if (
        action === "request-revision" &&
        FINALIZED_DOCUMENT_STATUSES.has(current.status)
      ) {
        if (current.document_type !== DocumentType.SOFTCOPY) {
          throw new ConflictException("Only a Softcopy document can start a new revision request.");
        }
        const canManageRevision = current.created_by === actorId ||
          current.assignments.some((assignment) => assignment.user_id === actorId) ||
          (actor ? canManageDocuments(actor) : false);
        if (!canManageRevision) {
          throw new ForbiddenException("Only the document creator, an assigned user, or an administrator can request a new revision.");
        }
        nextStatus = DocumentStatus.ForRevision;
        current.workflow_current_node_key = null;
      } else {
        if (![DocumentStatus.PendingApproval, DocumentStatus.ForApproval, DocumentStatus.ForNotedBy, DocumentStatus.ForPlantManagerApproval, DocumentStatus.ForDocumentControllerAdmin].includes(current.status as never)) {
          throw new ConflictException(`Cannot ${action} a ${current.status} request.`);
        }
        step = pendingStep;
        if (!step) {
          throw new ConflictException(`Cannot ${action} a ${current.status} request.`);
        }
        if (step.assigned_user_id !== actorId) {
          throw new ForbiddenException("You are not the configured approver for this workflow step.");
        }
        const configuredTargetKey = action === "approve"
          ? step.on_approve_node_key
          : action === "reject"
            ? step.on_reject_node_key
            : step.on_return_node_key;
        const previousHolderStep = action === "request-revision"
          ? current.workflow_steps
            .filter((candidate) =>
              candidate.sequence < step!.sequence &&
              candidate.status === WorkflowStepStatus.APPROVED,
            )
            .sort((left, right) => right.sequence - left.sequence)[0]
          : undefined;
        const isLegacyStep = !current.workflow_version_id && (!step.node_key || step.node_key.startsWith("legacy-"));
        const legacyNextStep = action === "approve" && isLegacyStep
            ? current.workflow_steps.find(
                (candidate) =>
                  candidate.sequence > step!.sequence &&
                  new Set<WorkflowStepStatus>([
                    WorkflowStepStatus.QUEUED,
                    WorkflowStepStatus.PENDING,
                  ]).has(candidate.status),
              )
            : undefined;
        const nextStep = action === "request-revision"
          ? previousHolderStep
          : configuredTargetKey
            ? current.workflow_steps.find((candidate) => candidate.node_key === configuredTargetKey)
            : legacyNextStep;

        if (action !== "request-revision" && configuredTargetKey && !nextStep) {
          throw new ConflictException("The configured workflow path points to a missing approval step.");
        }
        if (nextStep) {
          nextStatus = this.workflowStatusForStage(nextStep.stage);
          await tx.documentWorkflowStep.updateMany({
            where: {
              document_id: documentId,
              status: WorkflowStepStatus.PENDING,
              workflow_step_id: { not: step.workflow_step_id },
            },
            data: { status: WorkflowStepStatus.QUEUED },
          });
          await tx.documentWorkflowStep.update({
            where: { workflow_step_id: nextStep.workflow_step_id },
            data: action === "request-revision"
              ? {
                status: WorkflowStepStatus.PENDING,
                acted_by_user_id: null,
                acted_at: null,
                acted_user_name_snapshot: null,
                acted_position_title_snapshot: null,
                decision: null,
                comments: null,
              }
              : { status: WorkflowStepStatus.PENDING },
          });
          current.workflow_current_node_key = nextStep.node_key;
        } else if (action === "request-revision") {
          nextStatus = DocumentStatus.ForRevision;
          current.workflow_current_node_key = null;
        } else if (action === "reject") {
          nextStatus = DocumentStatus.Rejected;
          current.workflow_current_node_key = null;
        } else {
          nextStatus = current.action_requested === DocumentActionRequested.CANCELLATION
            ? DocumentStatus.Cancelled
            : DocumentStatus.Approved;
          current.workflow_current_node_key = null;
        }
        const actingUser = await tx.user.findUnique({
          where: { user_id: actorId },
          select: {
            firstname: true,
            lastname: true,
            position_title: true,
          },
        });
        await tx.documentWorkflowStep.update({
          where: { workflow_step_id: step.workflow_step_id },
          data: {
            status: action === "approve" ? WorkflowStepStatus.APPROVED : action === "reject" ? WorkflowStepStatus.REJECTED : WorkflowStepStatus.RETURNED,
            acted_by_user_id: actorId,
            acted_at: new Date(),
            acted_user_name_snapshot: actingUser
              ? this.workflowUserName(actingUser)
              : actor
                ? this.workflowUserName(actor)
                : "Unknown user",
            acted_position_title_snapshot: actingUser?.position_title?.trim() || null,
            decision: action,
            comments: remarks?.trim() || null,
          },
        });
        if (
          action === "approve" &&
          current.document_type === DocumentType.SOFTCOPY &&
          (step.stage === DocumentWorkflowStage.PLANT_MANAGER ||
            nextStatus === DocumentStatus.Approved)
        ) {
          await this.approvePendingSoftcopyAttachments(
            tx,
            current.document_id,
            actorId,
          );
        }
      }

      if (action === "reject" && nextStatus === DocumentStatus.Rejected) {
        attachmentFilesToRemove.push(
          ...(await this.rejectSoftcopyAttachments(
            tx,
            current.document_id,
            actorId,
            remarks,
          )),
        );
      }

      const result = await tx.document.updateMany({
        where: { document_id: documentId, status: current.status, ...(originalNodeKey !== undefined ? { workflow_current_node_key: originalNodeKey } : {}) },
        data: {
          status: nextStatus,
          workflow_current_node_key: current.workflow_current_node_key,
          ...(action !== "submit"
            ? { reviewed_by_user_id: actorId, reviewed_at: new Date(), reviewer_remarks: remarks?.trim() || null }
            : {}),
          ...(receivedAt ? { date_received: receivedAt } : {}),
          ...(nextStatus === DocumentStatus.Approved ? { approval_date: new Date() } : {}),
          ...(releasedAt ? { date_released: releasedAt } : {}),
        },
      });
      if (result.count !== 1) throw new ConflictException("Request status changed; refresh and try again.");
      await tx.documentStatusHistory.create({
        data: {
          document_id: documentId,
          previous_status: current.status,
          new_status: nextStatus,
          action,
          performed_by: actorId,
          remarks: remarks?.trim() || null,
        },
      });
      return tx.document.findUnique({
        where: { document_id: documentId },
        include: {
          creator: { select: { user_id: true, firstname: true, lastname: true, username: true, position_title: true } },
          requester: true,
          reviewer: true,
          status_history: {
            orderBy: { created_at: "desc" },
            include: { actor: true },
          },
        },
      });
    });

    await Promise.all(
      [...new Set(attachmentFilesToRemove)].map((filePath) =>
        this.removeStoredAttachmentFile(filePath),
      ),
    );

    if (action === "approve" && transitionedDocument?.status === DocumentStatus.Approved) {
      void this.prepareCurrentRevisionArtifacts(documentId).catch((error) => {
        this.logger.error(
          `Softcopy artifact preparation failed for document ${documentId.toString()}. Downloads will retry lazily.`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    }

    return transitionedDocument;
  }

  private async approvePendingSoftcopyAttachments(
    tx: Prisma.TransactionClient,
    documentId: bigint,
    approverId: bigint,
  ) {
    const softcopy = await tx.softcopyDocument.findUnique({
      where: { document_id: documentId },
      select: { softcopy_id: true },
    });
    if (!softcopy) return;

    await tx.softcopyAttachment.updateMany({
      where: {
        softcopy_id: softcopy.softcopy_id,
        status: SoftcopyAttachmentStatus.PendingApproval,
      },
      data: {
        status: SoftcopyAttachmentStatus.Approved,
        approved_by_user_id: approverId,
        approved_at: new Date(),
        rejected_by_user_id: null,
        rejected_at: null,
        rejection_reason: null,
      },
    });
  }

  private async rejectSoftcopyAttachments(
    tx: Prisma.TransactionClient,
    documentId: bigint,
    rejectorId: bigint,
    reason?: string,
  ) {
    const softcopy = await tx.softcopyDocument.findUnique({
      where: { document_id: documentId },
      select: { softcopy_id: true },
    });
    if (!softcopy) return [];

    const attachments = await tx.softcopyAttachment.findMany({
      where: {
        softcopy_id: softcopy.softcopy_id,
        status: {
          notIn: [
            SoftcopyAttachmentStatus.Rejected,
            SoftcopyAttachmentStatus.Cancelled,
          ],
        },
      },
      select: { attachment_id: true, file_path: true },
    });
    if (!attachments.length) return [];

    await tx.softcopyAttachment.updateMany({
      where: { attachment_id: { in: attachments.map((attachment) => attachment.attachment_id) } },
      data: {
        status: SoftcopyAttachmentStatus.Rejected,
        rejected_by_user_id: rejectorId,
        rejected_at: new Date(),
        rejection_reason: reason?.trim() || "The Softcopy request was rejected.",
      },
    });
    return attachments.map((attachment) => attachment.file_path);
  }

  private async finalizeApprovedSoftcopy(
    tx: Prisma.TransactionClient,
    documentId: bigint,
    approverId: bigint,
  ) {
    const softcopy = await tx.softcopyDocument.findUnique({
      where: { document_id: documentId },
      include: { current_revision: true, revisions: { orderBy: { created_at: "desc" } } },
    });
    if (!softcopy) return;
    const revision = softcopy.revisions.find((candidate) => !candidate.approved_at);
    if (!revision) {
      throw new ConflictException("A controlled Softcopy file is required before final approval.");
    }
    if (!revision.series_number || !revision.page_number || !revision.effective_date || !revision.document_title || !revision.file_path) {
      throw new ConflictException(
        "Document Number, Revision Number, Effectivity Date, Series Number, Page Number, Document Title, and the controlled Softcopy file are required before approval.",
      );
    }
    if (!softcopy.document_number) {
      throw new ConflictException("A Document Number is required before final Softcopy approval.");
    }
    const now = new Date();
    if (softcopy.current_revision_id) {
      await tx.documentRevision.update({
        where: { revision_id: softcopy.current_revision_id },
        data: { is_current: false, is_historical: true },
      });
    }
    await tx.documentRevision.update({
      where: { revision_id: revision.revision_id },
      data: {
        is_current: true,
        is_historical: false,
        approved_by_user_id: approverId,
        approved_at: now,
        approval_date: now,
      },
    });
    await tx.softcopyDocument.update({
      where: { softcopy_id: softcopy.softcopy_id },
      data: { current_revision_id: revision.revision_id },
    });
  }

  private async updateDraftWorkflow(
    tx: Prisma.TransactionClient,
    documentId: bigint,
    existing: { created_by: bigint; status: DocumentStatus; document_type: DocumentType; workflow_version_id: bigint | null; workflow_snapshot: Prisma.JsonValue | null; action_requested: DocumentActionRequested; business_document_type: CreateDocumentDto["business_document_type"] | null; requested_by_name: string | null },
    dto: UpdateDocumentDto,
    actor?: AuthenticatedUser,
  ): Promise<Prisma.DocumentUncheckedUpdateInput> {
    if (dto.workflow_version_id === undefined && dto.workflow_plan === undefined) return {};
    if (existing.status !== DocumentStatus.Draft) {
      throw new ConflictException("The workflow definition is locked after submission. Reassign a pending step with an audit reason instead.");
    }
    if (dto.workflow_plan && actor && !hasAnyPermission(actor, [DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION])) {
      throw new ForbiddenException("You do not have permission to customize document approval workflows.");
    }
    const documentType = dto.document_type ?? existing.document_type;
    const action = dto.action_requested ?? existing.action_requested;
    let keepSnapshot = !!dto.workflow_version_id && dto.workflow_version_id === existing.workflow_version_id?.toString() && !!existing.workflow_snapshot && documentType === existing.document_type;
    if (keepSnapshot) {
      const savedVersion = await tx.workflowVersion.findUnique({ where: { workflow_version_id: existing.workflow_version_id! }, select: { workflow_definition: { select: { workflow_key: true } } } });
      keepSnapshot = savedVersion?.workflow_definition.workflow_key === systemWorkflowKey(documentType, action);
    }
    // A saved default snapshot remains immutable after newer versions are published.
    const version = keepSnapshot ? null : await this.loadDefaultWorkflowVersion(documentType, action, tx);
    if (!keepSnapshot && !version) throw new ConflictException("No active system-default approval workflow is published.");
    if (!keepSnapshot && dto.workflow_version_id && dto.workflow_version_id !== version?.workflow_version_id.toString()) {
      throw new BadRequestException("Only the current system-default published workflow can be selected. Reload the workflow selection.");
    }
    const snapshot = keepSnapshot ? existing.workflow_snapshot : version?.graph;
    const plan = snapshot ? this.workflowGraphToPlan(snapshot, {
      document_type: documentType,
      action_requested: action,
      business_document_type: dto.business_document_type ?? existing.business_document_type ?? undefined,
      requester_type: (dto.requested_by_name !== undefined ? dto.requested_by_name : existing.requested_by_name) ? "MANUAL_NAME" : "CURRENT_USER",
    } as CreateDocumentDto) : this.parseWorkflowPlan(dto.workflow_plan, documentType, action);
    const configuration = await tx.documentApproverConfiguration.findUnique({ where: { document_id: documentId } });
    const data = {
      workflow_name: version?.workflow_definition.name || (keepSnapshot ? configuration?.workflow_name : dto.workflow_name?.trim()) || this.defaultWorkflowName(documentType, action),
      workflow_version: version?.version_number ?? (keepSnapshot ? configuration?.workflow_version ?? 1 : this.parseWorkflowVersion(dto.workflow_version)),
      workflow_plan: plan as unknown as Prisma.InputJsonValue,
    };
    await tx.documentApproverConfiguration.upsert({
      where: { document_id: documentId },
      create: { document_id: documentId, configured_by_user_id: actor ? toBigIntId(actor.user_id, "current_user_id") : existing.created_by, ...data },
      update: data,
    });
    return {
      workflow_version_id: keepSnapshot ? existing.workflow_version_id : version?.workflow_version_id ?? null,
      workflow_snapshot: snapshot ? snapshot as Prisma.InputJsonValue : Prisma.DbNull,
      workflow_current_node_key: null,
    };
  }

  async update(id: string, dto: UpdateDocumentDto, actor?: AuthenticatedUser) {
    const document_id = toBigIntId(id, "document_id");

    try {
      const updatedDocument = await this.prisma.$transaction(async (tx) => {
        const existingDocument = await tx.document.findUnique({
          where: { document_id },
          select: {
            status: true,
            document_type: true,
            created_by: true,
            workflow_version_id: true,
            workflow_snapshot: true,
            action_requested: true,
            business_document_type: true,
            requested_by_name: true,
            softcopy: { select: { softcopy_id: true, document_number: true, series_number: true } },
          },
        });

        if (!existingDocument) {
          return null;
        }

        const editableStatuses = new Set<DocumentStatus>([
          DocumentStatus.Draft,
          DocumentStatus.ReturnedForCorrection,
          DocumentStatus.ForRevision,
        ]);
        if (!editableStatuses.has(existingDocument.status)) {
          throw new ConflictException(
            "Controlled request data can only be changed while it is a draft or returned for correction.",
          );
        }

        const nextDocumentType = dto.document_type ?? existingDocument.document_type;
        const workflowData = await this.updateDraftWorkflow(tx, document_id, existingDocument, dto, actor);
        const isSoftcopy = nextDocumentType === DocumentType.SOFTCOPY;
        const nextActionRequested = dto.action_requested;
        const requestedDocumentNumber = dto.document_number?.trim() || null;
        if (isSoftcopy && dto.document_number !== undefined && !requestedDocumentNumber) {
          throw new BadRequestException("Document Number is required for every Softcopy document.");
        }
        if (isSoftcopy && !requestedDocumentNumber && !existingDocument.softcopy?.document_number) {
          throw new BadRequestException("Document Number is required for every Softcopy document.");
        }
        if (isSoftcopy && dto.series_number !== undefined && !dto.series_number.trim()) {
          throw new BadRequestException("Series Number is required for every Softcopy document.");
        }
        if (isSoftcopy && !dto.series_number?.trim() && !existingDocument.softcopy?.series_number) {
          throw new BadRequestException("Series Number is required for every Softcopy document.");
        }
        if (isSoftcopy && existingDocument.softcopy && (dto.document_number !== undefined || dto.series_number !== undefined)) {
          const nextDocumentNumber = requestedDocumentNumber ?? existingDocument.softcopy.document_number;
          const nextSeriesNumber = dto.series_number?.trim() || existingDocument.softcopy.series_number;
          const duplicatePair = await tx.softcopyDocument.findFirst({
            where: {
              softcopy_id: { not: existingDocument.softcopy.softcopy_id },
              document_number: { equals: nextDocumentNumber!, mode: "insensitive" } as any,
              series_number: { equals: nextSeriesNumber!, mode: "insensitive" } as any,
            },
            select: { softcopy_id: true },
          });
          if (duplicatePair) {
            throw new ConflictException(`Series Number ${nextSeriesNumber} is already used for Document Number ${nextDocumentNumber}. Use a different Series Number.`);
          }
        }
        if (
          nextDocumentType === DocumentType.HARDCOPY &&
          requestedDocumentNumber
        ) {
          throw new BadRequestException(
            "Hardcopy records do not use a Document Number. Use the document title and storage classification.",
          );
        }
        const document = await tx.document.update({
          where: { document_id },
          data: {
            ...workflowData,
            ...(dto.document_title
              ? { document_title: dto.document_title.trim().toUpperCase() }
              : {}),
            ...(dto.document_type ? { document_type: dto.document_type } : {}),
            ...(isSoftcopy
              ? {
                  ...(dto.requested_by_name !== undefined
                    ? { requested_by_name: dto.requested_by_name?.trim() || null }
                    : {}),
                  ...(dto.department !== undefined ? { department: dto.department?.trim() || null } : {}),
                  ...(dto.business_document_type !== undefined ? { business_document_type: dto.business_document_type } : {}),
                  ...(nextActionRequested !== undefined ? { action_requested: nextActionRequested } : {}),
                  ...(dto.from_party !== undefined ? { from_party: dto.from_party?.trim() || null } : {}),
                  ...(dto.to_party !== undefined ? { to_party: dto.to_party?.trim() || null } : {}),
                  ...(dto.reason_for_change !== undefined ? { reason_for_change: dto.reason_for_change } : {}),
                  ...(dto.brief_description !== undefined ? { brief_description: dto.brief_description?.trim() || null } : {}),
                  ...(dto.proposed_change !== undefined ? { proposed_change: dto.proposed_change?.trim() || null } : {}),
                  ...(dto.revision_level_from !== undefined ? { revision_level_from: dto.revision_level_from?.trim() || null } : {}),
                  ...(dto.revision_level_to !== undefined ? { revision_level_to: dto.revision_level_to?.trim() || null } : {}),
                  ...(dto.previous_effective_date !== undefined ? { previous_effective_date: new Date(dto.previous_effective_date) } : {}),
                  ...(dto.new_effective_date !== undefined ? { new_effective_date: new Date(dto.new_effective_date) } : {}),
                }
              : {
                  requested_by_name: null,
                  department: null,
                  business_document_type: null,
                  action_requested: DocumentActionRequested.CREATE,
                  from_party: null,
                  to_party: null,
                  reason_for_change: null,
                  brief_description: null,
                  proposed_change: null,
                  revision_level_from: null,
                  revision_level_to: null,
                  previous_effective_date: null,
                  new_effective_date: null,
                  date_received: null,
                  date_released: null,
                  approval_date: null,
                }),
          },
        });

        const hardcopyData: Prisma.HardcopyDocumentUncheckedUpdateInput = {
          ...this.resolveRetentionData(dto, true),
          ...(dto.asset_id !== undefined
            ? {
                asset_id: dto.asset_id
                  ? toBigIntId(dto.asset_id, "asset_id")
                  : null,
              }
            : {}),
          ...(dto.area_id !== undefined
            ? {
                area_id: dto.area_id
                  ? toBigIntId(dto.area_id, "area_id")
                  : undefined,
              }
            : {}),
          ...(dto.specific_id !== undefined
            ? {
                specific_id: dto.specific_id
                  ? toBigIntId(dto.specific_id, "specific_id")
                  : null,
              }
            : {}),
          ...(dto.location_id !== undefined
            ? {
                location_id: dto.location_id
                  ? toBigIntId(dto.location_id, "location_id")
                  : undefined,
              }
            : {}),
          ...(dto.sequence_id !== undefined
            ? {
                sequence_id: dto.sequence_id
                  ? toBigIntId(dto.sequence_id, "sequence_id")
                  : null,
              }
            : {}),
        };

        const hasHardcopyUpdate = Object.keys(hardcopyData).length > 0;

        if (hasHardcopyUpdate) {
          const existingHardcopy = await tx.hardcopyDocument.findUnique({
            where: { document_id },
          });

          if (existingHardcopy) {
            const route = await this.resolveHardcopyStorageRoute(tx, {
              area_id: dto.area_id ?? existingHardcopy.area_id.toString(),
              specific_id: dto.specific_id !== undefined ? dto.specific_id : existingHardcopy.specific_id?.toString(),
              asset_id: dto.asset_id !== undefined ? dto.asset_id : existingHardcopy.asset_id?.toString(),
              location_id: dto.location_id ?? existingHardcopy.location_id.toString(),
            });
            await tx.hardcopyDocument.update({
              where: { document_id },
              data: { ...hardcopyData, ...route },
            });
          } else {
            if (!dto.area_id || !dto.location_id) {
              throw new BadRequestException(
                "Hardcopy documents require area_id and location_id.",
              );
            }

            const route = await this.resolveHardcopyStorageRoute(tx, {
              area_id: dto.area_id,
              specific_id: dto.specific_id,
              asset_id: dto.asset_id,
              location_id: dto.location_id,
            });
            await tx.hardcopyDocument.create({
              data: {
                document_id,
                ...route,
                ...(dto.sequence_id
                  ? { sequence_id: toBigIntId(dto.sequence_id, "sequence_id") }
                  : {}),
              },
            });
          }
        }

        if (dto.softcopy_category_id !== undefined) {
          const categoryId = await this.resolveSoftcopyCategoryId(
            tx,
            dto.softcopy_category_id,
          );
          await tx.softcopyDocument.update({
            where: { document_id },
            data: { softcopy_category_id: categoryId },
          });
        }

        if (nextDocumentType === DocumentType.SOFTCOPY && (dto.document_number !== undefined || dto.series_number !== undefined)) {
          await tx.softcopyDocument.updateMany({
            where: { document_id },
            data: {
              ...(dto.document_number !== undefined ? { document_number: requestedDocumentNumber } : {}),
              ...(dto.series_number !== undefined ? { series_number: dto.series_number.trim() } : {}),
            },
          });
        } else if (nextDocumentType === DocumentType.HARDCOPY) {
          await tx.softcopyDocument.updateMany({
            where: { document_id },
            data: { document_number: null },
          });
        }

        return tx.document.findUnique({
          where: { document_id: document.document_id },
          include: {
            requester: {
              select: {
                user_id: true,
                firstname: true,
                lastname: true,
              },
            },
            disposer: {
              select: {
                user_id: true,
                firstname: true,
                lastname: true,
              },
            },
            creator: { select: { user_id: true, firstname: true, lastname: true, username: true, position_title: true } },
            hardcopy: {
              include: {
                asset: true,
                area: true,
                specific: true,
                location: true,
                sequence: true,
              },
            },
            softcopy: {
              include: {
                category: true,
                current_revision: true,
              },
            },
          },
        });
      });
      if (updatedDocument && dto.softcopy_category_id !== undefined) {
        await this.organizeRevisionStorage(document_id);
      }
      return updatedDocument;
    } catch (error) {
      this.rethrowDocumentNumberConflict(error);
    }
  }

  private rethrowDocumentNumberConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "A document with this document number already exists.",
      );
    }
    throw error;
  }

  async dispose(id: string, dto: DisposeDocumentDto, user?: AuthenticatedUser) {
    const document_id = toBigIntId(id, "document_id");
    await this.assertDocumentAccess(document_id, user);
    const existingDocument = await this.prisma.document.findUnique({
      where: { document_id },
      select: {
        status: true,
        status_before_disposal: true,
      },
    });

    if (!existingDocument) {
      return null;
    }

    if (!FINALIZED_DOCUMENT_STATUSES.has(existingDocument.status)) {
      throw new ConflictException("Only approved or completed documents can be disposed.");
    }

    const disposer = await this.prisma.user.findUnique({
      where: { user_id: toBigIntId(dto.disposed_by_user_id, "disposed_by_user_id") },
      select: { user_id: true },
    });
    if (!disposer) {
      throw new BadRequestException("The selected disposal user was not found.");
    }

    return this.prisma.document.update({
      where: { document_id },
      data: {
        ...this.buildWorkflowStateUpdateData(
          DocumentStatus.Disposed,
          dto,
          existingDocument.status_before_disposal ?? existingDocument.status,
        ),
      },
      include: {
        requester: {
          select: {
            user_id: true,
            firstname: true,
            lastname: true,
          },
        },
        disposer: {
          select: {
            user_id: true,
            firstname: true,
            lastname: true,
          },
        },
        creator: true,
        hardcopy: {
          include: {
            asset: true,
            area: true,
            specific: true,
            location: true,
            sequence: true,
          },
        },
        softcopy: {
          include: {
            category: true,
            current_revision: true,
          },
        },
      },
    });
  }

  async requestDisposal(id: string, dto: DisposeDocumentDto, user: AuthenticatedUser) {
    const document_id = toBigIntId(id, "document_id");
    await this.assertDocumentAccess(document_id, user);
    const document = await this.prisma.document.findUnique({ where: { document_id }, select: { status: true } });
    if (!document) throw new NotFoundException("Document not found.");
    if (!FINALIZED_DOCUMENT_STATUSES.has(document.status)) {
      throw new ConflictException("Only approved or completed documents can be requested for disposal.");
    }
    const pending = await this.prisma.documentDisposalRequest.findFirst({
      where: { document_id, status: "Pending" },
      select: { disposal_request_id: true },
    });
    if (pending) throw new ConflictException("This document already has a pending disposal request.");
    return this.prisma.documentDisposalRequest.create({
      data: {
        document_id,
        requested_by_user_id: toBigIntId(user.user_id, "user_id"),
        disposal_remarks: dto.disposal_remarks.trim(),
        disposal_action: this.resolveDisposalAction(dto.disposal_action),
        disposal_action_other: this.resolveDisposalActionOther(dto),
      },
      include: { document: true, requester: { select: { user_id: true, firstname: true, lastname: true, username: true } } },
    });
  }

  listPendingDisposalRequests() {
    return this.prisma.documentDisposalRequest.findMany({
      where: { status: "Pending" },
      orderBy: { created_at: "asc" },
      include: {
        document: { include: { hardcopy: { include: { area: true, location: true } }, softcopy: { include: { category: true } } } },
        requester: { select: { user_id: true, firstname: true, lastname: true, username: true } },
      },
    });
  }

  listDisposalRequests() {
    return this.prisma.documentDisposalRequest.findMany({
      orderBy: { created_at: "desc" },
      include: {
        document: { include: { hardcopy: { include: { area: true, location: true } }, softcopy: { include: { category: true } } } },
        requester: { select: { user_id: true, firstname: true, lastname: true, username: true } },
        reviewer: { select: { user_id: true, firstname: true, lastname: true, username: true } },
      },
    });
  }

  listMyDisposalRequests(user: AuthenticatedUser) {
    return this.prisma.documentDisposalRequest.findMany({
      where: { requested_by_user_id: toBigIntId(user.user_id, "user_id") },
      orderBy: { created_at: "desc" },
      include: {
        document: true,
        requester: { select: { user_id: true, firstname: true, lastname: true, username: true } },
        reviewer: { select: { user_id: true, firstname: true, lastname: true, username: true } },
      },
    });
  }

  async reviewDisposalRequest(requestId: string, approve: boolean, remarks: string | undefined, user: AuthenticatedUser) {
    const disposal_request_id = toBigIntId(requestId, "disposal_request_id");
    return this.prisma.$transaction(async (transaction) => {
      const request = await transaction.documentDisposalRequest.findUnique({
        where: { disposal_request_id },
        include: { requester: { select: { user_id: true, firstname: true, lastname: true } }, document: { select: { status: true, status_before_disposal: true } } },
      });
      if (!request) throw new NotFoundException("Disposal request not found.");
      if (request.status !== "Pending") throw new ConflictException("This disposal request was already reviewed.");
      if (approve && !FINALIZED_DOCUMENT_STATUSES.has(request.document.status)) {
        throw new ConflictException("Only approved or completed documents can be disposed.");
      }
      if (approve) {
        const requesterName = `${request.requester.firstname} ${request.requester.lastname}`.trim();
        await transaction.document.update({
          where: { document_id: request.document_id },
          data: this.buildWorkflowStateUpdateData(DocumentStatus.Disposed, {
            disposal_remarks: request.disposal_remarks,
            disposal_action: request.disposal_action,
            disposal_action_other: request.disposal_action_other,
            disposed_by_user_id: request.requested_by_user_id.toString(),
            disposed_by_name: requesterName,
          }, request.document.status_before_disposal ?? request.document.status),
        });
      }
      return transaction.documentDisposalRequest.update({
        where: { disposal_request_id },
        data: {
          status: approve ? "Approved" : "Rejected",
          reviewed_by_user_id: toBigIntId(user.user_id, "user_id"),
          reviewer_remarks: remarks?.trim() || null,
          reviewed_at: new Date(),
        },
        include: { document: true, requester: { select: { user_id: true, firstname: true, lastname: true, username: true } } },
      });
    });
  }

  async restore(id: string) {
    const document_id = toBigIntId(id, "document_id");
    const existingDocument = await this.prisma.document.findUnique({
      where: { document_id },
      select: {
        status_before_disposal: true,
      },
    });

    if (!existingDocument) {
      return null;
    }

    return this.prisma.document.update({
      where: { document_id },
      data: {
        ...this.buildWorkflowStateUpdateData(
          existingDocument.status_before_disposal ?? DocumentStatus.Approved,
          {},
        ),
      },
      include: {
        requester: {
          select: {
            user_id: true,
            firstname: true,
            lastname: true,
          },
        },
        disposer: {
          select: {
            user_id: true,
            firstname: true,
            lastname: true,
          },
        },
        creator: true,
        hardcopy: {
          include: {
            asset: true,
            area: true,
            specific: true,
            location: true,
            sequence: true,
          },
        },
        softcopy: {
          include: {
            category: true,
            current_revision: true,
          },
        },
      },
    });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const documentId = toBigIntId(id, "document_id");
    const existing = await this.prisma.document.findUnique({
      where: { document_id: documentId },
      select: { status: true, created_by: true },
    });
    if (!existing) throw new NotFoundException("Document not found.");

    if (!canManageDocuments(actor)) {
      if (existing.status !== DocumentStatus.Draft) {
        throw new ConflictException("Only Draft documents can be removed by Staff.");
      }
      if (existing.created_by !== toBigIntId(actor.user_id, "current_user_id")) {
        throw new ForbiddenException("Only the Draft creator can remove this document.");
      }
    }

    return this.prisma.document.delete({ where: { document_id: documentId } });
  }

  async createRevision(
    documentId: string,
    dto: CreateRevisionDto,
    file?: Express.Multer.File,
    actor?: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException("Revision file is required.");
    }

    if (dto.set_as_current === "true" && !actor) {
      throw new BadRequestException(
        "A revision becomes current only after the complete Softcopy approval workflow.",
      );
    }

    const document_id = toBigIntId(documentId, "document_id");
    const document = await this.prisma.document.findUnique({
      where: { document_id },
      include: {
        softcopy: { include: { category: true } },
      },
    });

    if (!document) {
      return null;
    }

    const canEditAllDocuments = !!actor && canManageDocuments(actor);
    const correctionRevisionId = dto.superseded_by_revision_id
      ? toBigIntId(dto.superseded_by_revision_id, "superseded_by_revision_id")
      : null;
    if (correctionRevisionId && !dto.correction_reason?.trim()) {
      throw new BadRequestException("A reason is required to replace or correct a controlled file.");
    }
    if (actor && !canEditAllDocuments) {
      const actorId = toBigIntId(actor.user_id, "current_user_id");
      const canManage = await this.prisma.document.findFirst({
        where: {
          document_id,
          OR: [{ created_by: actorId }, { assignments: { some: { user_id: actorId } } }],
        },
        select: { document_id: true },
      });
      if (!canManage) {
        throw new ForbiddenException(
          "Staff can only revise documents they created or that are assigned to them.",
        );
      }
      const canUploadRevision = document.status === DocumentStatus.Approved ||
        (correctionRevisionId && document.status === DocumentStatus.Completed);
      if (!canUploadRevision) {
        throw new ConflictException(
          "A revised file requires a new revision request after the current document is approved or completed.",
        );
      }
    }

    if (actor && !correctionRevisionId && document.status !== DocumentStatus.Approved && !canEditAllDocuments) {
      throw new ConflictException("A revision file can be uploaded only after the Document Control Request completes all required approvals.");
    }
    if (actor && correctionRevisionId && !new Set<DocumentStatus>([DocumentStatus.Approved, DocumentStatus.Completed]).has(document.status)) {
      throw new ConflictException("A file correction can only start from an approved or completed Softcopy document.");
    }

    if (document.document_type !== DocumentType.SOFTCOPY) {
      throw new BadRequestException(
        "Revisions can only be created for softcopy documents.",
      );
    }

    if (
      dto.set_as_current === "true" &&
      (!document.softcopy?.document_number ||
        !dto.effective_date ||
        !dto.series_number?.trim() ||
        !dto.page_number?.trim())
    ) {
      throw new BadRequestException(
        "Document Number, Effectivity Date, Series Number, and Page Number are required before uploading and finalizing a controlled copy.",
      );
    }

    let softcopy = document.softcopy;
    if (dto.softcopy_category_id) {
      const categoryId = await this.resolveSoftcopyCategoryId(this.prisma, dto.softcopy_category_id);
      softcopy = document.softcopy
        ? await this.prisma.softcopyDocument.update({
            where: { softcopy_id: document.softcopy.softcopy_id },
            data: { softcopy_category_id: categoryId },
            include: { category: true },
          })
        : await this.prisma.softcopyDocument.create({
            data: { document_id, softcopy_category_id: categoryId },
            include: { category: true },
          });
    } else if (!softcopy) {
      softcopy = await this.prisma.softcopyDocument.create({
        data: { document_id, softcopy_category_id: await this.resolveSoftcopyCategoryId(this.prisma) },
        include: { category: true },
      });
    }

    const categoryFolder = softcopy.category.folder_name;
    const seriesNumber = dto.series_number?.trim();
    if (!seriesNumber) {
      throw new BadRequestException("Series Number is required for every Softcopy revision.");
    }
    await this.assertDocumentSeriesAvailable(
      softcopy.document_number,
      seriesNumber,
      softcopy.softcopy_id,
    );
    const revision_number = dto.revision_number?.trim() ||
      await this.getNextRevisionNumber(softcopy.softcopy_id);

    const duplicateRevision = await this.prisma.documentRevision.findFirst({
      where: {
        softcopy_id: softcopy.softcopy_id,
        revision_number,
      },
      select: { revision_id: true },
    });
    if (duplicateRevision) {
      throw new ConflictException(
        `Revision ${revision_number} already exists for this document.`,
      );
    }

    if (correctionRevisionId) {
      const superseded = await this.prisma.documentRevision.findFirst({
        where: { revision_id: correctionRevisionId, softcopy_id: softcopy.softcopy_id },
        select: { revision_id: true, is_current: true },
      });
      if (!superseded) throw new BadRequestException("The controlled revision being corrected was not found.");
    }

    const storedFilePath = await this.moveRevisionUpload(file, categoryFolder);

    const revision = await this.prisma.documentRevision.create({
      data: {
        revision_number,
        reason_of_revision: dto.reason_of_revision,
        effective_date: dto.effective_date,
        page_number: dto.page_number,
        series_number: seriesNumber,
        document_title: document.document_title,
        revision_level_from: dto.revision_level_from,
        revision_level_to: dto.revision_level_to,
        previous_effective_date: dto.previous_effective_date,
        new_effective_date: dto.new_effective_date,
        date_received: document.date_received ?? (document.status === DocumentStatus.Draft ? null : new Date()),
        date_released: null,
        approval_date: null,
        file_name: file.originalname,
        file_path: storedFilePath,
        file_size: BigInt(file.size),
        mime_type: file.mimetype,
        superseded_by_revision_id: correctionRevisionId,
        correction_reason: correctionRevisionId ? dto.correction_reason!.trim() : null,
        softcopy_id: softcopy.softcopy_id,
        uploaded_by: actor
          ? toBigIntId(actor.user_id, "current_user_id")
          : toBigIntId(dto.uploaded_by, "uploaded_by"),
      },
    });

    if (correctionRevisionId) {
      const correctionStatus = document.status === DocumentStatus.Completed
        ? DocumentStatus.ForRevision
        : DocumentStatus.ForRevision;
      await this.prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { document_id },
          data: { status: correctionStatus, workflow_current_node_key: null },
        });
        if (actor) {
          await tx.documentStatusHistory.create({
            data: {
              document_id,
              previous_status: document.status,
              new_status: correctionStatus,
              action: "correct-file",
              performed_by: toBigIntId(actor.user_id, "current_user_id"),
              remarks: dto.correction_reason!.trim(),
            },
          });
        }
      });
    }

    const uploadedRevision = this.withRevisionUrls(revision);
    if (dto.set_as_current === "true") {
      if (document.status !== DocumentStatus.Approved || correctionRevisionId) {
        throw new ConflictException("Only a newly uploaded revision for an approved DCR can be finalized immediately.");
      }
      return this.finalizeRevision(documentId, revision.revision_id.toString(), actor!, dto.reason_of_revision?.trim() || "Controlled copy finalized.");
    }

    return uploadedRevision;
  }

  private async assertDocumentSeriesAvailable(documentNumberValue: string | null | undefined, seriesNumberValue: string, softcopyId?: bigint) {
    const documentNumber = documentNumberValue?.trim();
    const seriesNumber = seriesNumberValue.trim();
    if (!documentNumber) {
      throw new BadRequestException("Document Number is required for every Softcopy document.");
    }
    if (!seriesNumber) {
      throw new BadRequestException("Series Number is required for every Softcopy revision.");
    }

    const reserved = await this.prisma.softcopyDocument.findFirst({
      where: {
        ...(softcopyId ? { softcopy_id: { not: softcopyId } } : {}),
        document_number: { equals: documentNumber, mode: "insensitive" } as any,
        series_number: { equals: seriesNumber, mode: "insensitive" } as any,
      },
      select: { softcopy_id: true },
    });
    const existing = reserved || await this.prisma.documentRevision.findFirst({
      where: {
        series_number: { equals: seriesNumber, mode: "insensitive" } as any,
        softcopy: {
          document_number: { equals: documentNumber, mode: "insensitive" } as any,
        },
      },
      select: { revision_id: true },
    });
    if (existing) {
      throw new ConflictException(
        `Series Number ${seriesNumber} is already used for Document Number ${documentNumber}. Use a different Series Number.`,
      );
    }
  }

  async finalizeRevision(documentIdValue: string, revisionIdValue: string, actor: AuthenticatedUser, reason?: string) {
    const documentId = toBigIntId(documentIdValue, "document_id");
    const revisionId = toBigIntId(revisionIdValue, "revision_id");
    if (!hasAnyPermission(actor, ["documents.edit", "documents.manage-own", "document-requests.edit"])) {
      throw new ForbiddenException("You do not have permission to finalize a controlled copy.");
    }
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.findUnique({
        where: { document_id: documentId },
        include: { softcopy: { include: { current_revision: true } } },
      });
      const revision = await tx.documentRevision.findFirst({ where: { revision_id: revisionId, softcopy: { document_id: documentId } } });
      if (!document || !revision) throw new NotFoundException("The document revision was not found.");
      if (!canManageDocuments(actor) && document.created_by !== toBigIntId(actor.user_id, "current_user_id")) {
        const assignment = await tx.documentAssignment.findFirst({ where: { document_id: documentId, user_id: toBigIntId(actor.user_id, "current_user_id") }, select: { document_assignment_id: true } });
        if (!assignment) throw new ForbiddenException("Only the document creator, an assigned user, or an administrator can finalize this controlled copy.");
      }
      if (document.document_type !== DocumentType.SOFTCOPY || document.status !== DocumentStatus.Approved) {
        throw new ConflictException("A controlled copy can only be finalized after the DCR is approved.");
      }
      if (revision.approved_at) throw new ConflictException("This revision is already finalized.");
      if (!revision.file_path || !revision.document_title || !revision.series_number || !revision.page_number || !revision.effective_date || !document.softcopy?.document_number) {
        throw new ConflictException("Document Number, Revision Number, Effectivity Date, Series Number, Page Number, Document Title, and the file are required before finalization.");
      }
      const now = new Date();
      if (document.softcopy.current_revision_id) {
        await tx.documentRevision.update({ where: { revision_id: document.softcopy.current_revision_id }, data: { is_current: false, is_historical: true } });
      }
      await tx.documentRevision.update({ where: { revision_id: revisionId }, data: { is_current: true, is_historical: false, approved_by_user_id: toBigIntId(actor.user_id, "current_user_id"), approved_at: now, approval_date: now } });
      await tx.softcopyDocument.update({ where: { document_id: documentId }, data: { current_revision_id: revisionId } });
      await tx.document.update({ where: { document_id: documentId }, data: { status: DocumentStatus.Completed, date_released: now, approval_date: document.approval_date ?? now, reviewed_by_user_id: toBigIntId(actor.user_id, "current_user_id"), reviewed_at: now, reviewer_remarks: reason?.trim() || null, workflow_current_node_key: null } });
      await tx.documentStatusHistory.create({ data: { document_id: documentId, previous_status: document.status, new_status: DocumentStatus.Completed, action: "finalize-revision", performed_by: toBigIntId(actor.user_id, "current_user_id"), remarks: reason?.trim() || "Controlled copy finalized." } });
      return tx.documentRevision.findUnique({ where: { revision_id: revisionId }, include: { uploader: true, approver: true } }).then((value) => this.withRevisionUrls(value));
    });
  }

  async findRevisions(id: string, user?: AuthenticatedUser) {
    const document_id = toBigIntId(id, "document_id");

    await this.assertDocumentAccess(document_id, user);

    const softcopy = await this.prisma.softcopyDocument.findUnique({
      where: { document_id },
      include: {
        revisions: {
          orderBy: { created_at: "desc" },
          include: {
            uploader: {
              select: {
                user_id: true,
                firstname: true,
                lastname: true,
              },
            },
            approver: {
              select: {
                user_id: true,
                firstname: true,
                lastname: true,
              },
            },
            superseded_by_revision: {
              select: { revision_id: true, revision_number: true, file_name: true },
            },
          },
        },
      },
    });

    return (softcopy?.revisions ?? []).map((revision) =>
      this.withRevisionUrls(revision),
    );
  }

  async getStampedRevision(
    documentIdValue: string,
    revisionIdValue: string,
    user?: AuthenticatedUser,
  ) {
    return this.getOrCreateRevisionArtifact(
      documentIdValue,
      revisionIdValue,
      user,
      SoftcopyArtifactType.CONTROLLED,
    );
  }

  async getUncontrolledRevision(
    documentIdValue: string,
    revisionIdValue: string,
    user?: AuthenticatedUser,
  ) {
    return this.getOrCreateRevisionArtifact(
      documentIdValue,
      revisionIdValue,
      user,
      SoftcopyArtifactType.UNCONTROLLED,
    );
  }

  private async getOrCreateRevisionArtifact(
    documentIdValue: string,
    revisionIdValue: string,
    user: AuthenticatedUser | undefined,
    artifactType: SoftcopyArtifactType,
  ): Promise<RevisionArtifactDownload> {
    const documentId = toBigIntId(documentIdValue, "document_id");
    const revisionId = toBigIntId(revisionIdValue, "revision_id");

    await this.assertDocumentAccess(documentId, user);

    const revision = await this.prisma.documentRevision.findFirst({
      where: {
        revision_id: revisionId,
        softcopy: { document_id: documentId },
      },
      include: {
        softcopy: {
          select: {
            document_number: true,
            document: { select: { document_type: true, status: true } },
          },
        },
      },
    });

    if (
      !revision ||
      revision.softcopy.document.document_type !== DocumentType.SOFTCOPY
    ) {
      throw new NotFoundException("The softcopy revision was not found.");
    }

    if (!/\.(pdf|docx|xlsx|xls)$/i.test(revision.file_name)) {
      throw new BadRequestException(
        "Electronic stamps are supported for PDF, DOCX and Excel files only.",
      );
    }

    const sourcePath = await this.firstExistingFile([
      revision.file_path,
      join(
        revisionUploadsRoot,
        this.revisionStoragePath(revision.file_path) || "",
      ),
    ]);

    if (!sourcePath) {
      throw new NotFoundException("The original softcopy file was not found.");
    }

    const sourceStats = await stat(sourcePath);
    const sourceFingerprint = this.revisionArtifactFingerprint(
      revision,
      revision.softcopy.document.status,
      revision.softcopy.document_number,
      artifactType,
      sourceStats,
    );

    const existing = await this.prisma.softcopyRevisionArtifact.findUnique({
      where: {
        revision_id_artifact_type: {
          revision_id: revisionId,
          artifact_type: artifactType,
        },
      },
    });
    if (existing && existing.source_fingerprint === sourceFingerprint) {
      const existingStats = await this.fileStatsOrNull(existing.file_path);
      if (existingStats?.isFile()) {
        return {
          filePath: existing.file_path,
          filename: existing.file_name,
          mimeType: existing.mime_type,
          fileSize: Number(existingStats.size),
        };
      }
    }

    const buildKey = `${revisionId.toString()}:${artifactType}:${sourceFingerprint}`;
    const inFlight = this.artifactBuilds.get(buildKey);
    if (inFlight) return inFlight;

    const build = this.buildRevisionArtifact({
      artifactType,
      documentNumber: revision.softcopy.document_number,
      documentStatus: revision.softcopy.document.status,
      revision,
      revisionId,
      sourceFingerprint,
      sourcePath,
    }).finally(() => this.artifactBuilds.delete(buildKey));
    this.artifactBuilds.set(buildKey, build);
    return build;
  }

  private async buildRevisionArtifact(input: {
    artifactType: SoftcopyArtifactType;
    documentNumber: string | null;
    documentStatus: DocumentStatus;
    revision: Prisma.DocumentRevisionGetPayload<{
      include: { softcopy: { select: { document_number: true; document: { select: { document_type: true; status: true } } } } };
    }>;
    revisionId: bigint;
    sourceFingerprint: string;
    sourcePath: string;
  }): Promise<RevisionArtifactDownload> {
    const stamp = input.artifactType === SoftcopyArtifactType.CONTROLLED
      ? this.electronicDocumentStamp.buildStamp(input.documentStatus, input.revision, input.documentNumber)
      : this.electronicDocumentStamp.buildUncontrolledCopyStamp(input.revision, input.documentNumber);
    const stamped = await this.electronicDocumentStamp.stampFile(
      await readFile(input.sourcePath),
      input.revision.file_name,
      stamp,
    );
    ensureArtifactUploadsRoot();
    const artifactPath = join(
      artifactUploadsRoot,
      `${input.revisionId.toString()}-${input.artifactType.toLowerCase()}-${input.sourceFingerprint}${extname(stamped.fileName)}`,
    );
    const temporaryPath = `${artifactPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, stamped.buffer);
      await rename(temporaryPath, artifactPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    const artifact = await this.prisma.softcopyRevisionArtifact.upsert({
      where: {
        revision_id_artifact_type: {
          revision_id: input.revisionId,
          artifact_type: input.artifactType,
        },
      },
      create: {
        revision_id: input.revisionId,
        artifact_type: input.artifactType,
        file_name: input.artifactType === SoftcopyArtifactType.CONTROLLED
          ? stamped.fileName
          : stamped.fileName.replace(/-stamped(?=\.)/i, "-uncontrolled"),
        file_path: artifactPath,
        file_size: BigInt(stamped.buffer.length),
        mime_type: stamped.mimeType,
        source_fingerprint: input.sourceFingerprint,
        generator_version: SOFTCOPY_ARTIFACT_GENERATOR_VERSION,
      },
      update: {
        file_name: input.artifactType === SoftcopyArtifactType.CONTROLLED
          ? stamped.fileName
          : stamped.fileName.replace(/-stamped(?=\.)/i, "-uncontrolled"),
        file_path: artifactPath,
        file_size: BigInt(stamped.buffer.length),
        mime_type: stamped.mimeType,
        source_fingerprint: input.sourceFingerprint,
        generator_version: SOFTCOPY_ARTIFACT_GENERATOR_VERSION,
      },
    });
    return {
      filePath: artifact.file_path,
      filename: artifact.file_name,
      mimeType: artifact.mime_type,
      fileSize: stamped.buffer.length,
    };
  }

  private revisionArtifactFingerprint(
    revision: { revision_id: bigint; file_path: string; revision_number: string; effective_date: Date | null; new_effective_date: Date | null; is_current?: boolean; is_historical?: boolean; approved_at?: Date | null },
    documentStatus: DocumentStatus,
    documentNumber: string | null,
    artifactType: SoftcopyArtifactType,
    sourceStats: { size: number; mtimeMs: number },
  ) {
    return createHash("sha256")
      .update([
        SOFTCOPY_ARTIFACT_GENERATOR_VERSION,
        revision.revision_id.toString(),
        revision.file_path,
        sourceStats.size,
        sourceStats.mtimeMs,
        revision.revision_number,
        revision.effective_date?.toISOString() || "",
        revision.new_effective_date?.toISOString() || "",
        revision.is_current,
        revision.is_historical,
        revision.approved_at?.toISOString() || "",
        documentStatus,
        documentNumber || "",
        artifactType,
      ].join("\u0000"))
      .digest("hex");
  }

  private async fileStatsOrNull(filePath: string) {
    try {
      return await stat(filePath);
    } catch {
      return null;
    }
  }

  private async prepareCurrentRevisionArtifacts(documentId: bigint) {
    const document = await this.prisma.document.findUnique({
      where: { document_id: documentId },
      select: {
        status: true,
        document_type: true,
        softcopy: {
          select: {
            document_number: true,
            current_revision: { select: { revision_id: true, file_name: true } },
          },
        },
      },
    });
    const revision = document?.softcopy?.current_revision;
    if (
      !document ||
      document.document_type !== DocumentType.SOFTCOPY ||
      !revision ||
      !/\.(pdf|docx|xlsx|xls)$/i.test(revision.file_name)
    ) return;

    for (const artifactType of [SoftcopyArtifactType.CONTROLLED, SoftcopyArtifactType.UNCONTROLLED]) {
      await this.getOrCreateRevisionArtifact(
        documentId.toString(),
        revision.revision_id.toString(),
        undefined,
        artifactType,
      );
    }
  }

  async setAssignments(
    id: string,
    userIds: string[],
    actor: AuthenticatedUser,
  ) {
    if (!canManageDocuments(actor)) {
      throw new ForbiddenException(
        "Only a document manager can assign documents.",
      );
    }

    const documentId = toBigIntId(id, "document_id");
    const assignedBy = toBigIntId(actor.user_id, "current_user_id");
    const uniqueUserIds = [
      ...new Set(userIds.map((userId) => toBigIntId(userId, "user_id"))),
    ];
    const [document, users] = await Promise.all([
      this.prisma.document.findUnique({
        where: { document_id: documentId },
        select: { document_id: true },
      }),
      this.prisma.user.findMany({
        where: { user_id: { in: uniqueUserIds } },
        select: { user_id: true },
      }),
    ]);
    if (!document) throw new NotFoundException("Document was not found.");
    if (users.length !== uniqueUserIds.length)
      throw new BadRequestException("One or more selected users do not exist.");

    await this.prisma.$transaction(async (tx) => {
      await tx.documentAssignment.deleteMany({
        where: { document_id: documentId },
      });
      if (uniqueUserIds.length) {
        await tx.documentAssignment.createMany({
          data: uniqueUserIds.map((userId) => ({
            document_id: documentId,
            user_id: userId,
            assigned_by: assignedBy,
          })),
        });
      }
    });
    return this.findOne(id, actor);
  }

  async findUserAssignmentOptions(userId: string, actor: AuthenticatedUser) {
    this.assertAdministrativeActor(actor);
    const parsedUserId = toBigIntId(userId, "user_id");
    const user = await this.prisma.user.findUnique({
      where: { user_id: parsedUserId },
      select: { user_id: true },
    });
    if (!user) throw new NotFoundException("User was not found.");

    const documents = await this.prisma.document.findMany({
      orderBy: [{ document_type: "asc" }, { document_title: "asc" }],
      select: {
        document_id: true,
        document_title: true,
        document_type: true,
        status: true,
        hardcopy: {
          select: {
            area: { select: { area_id: true, area_name: true } },
            location: { select: { location_id: true, location_name: true } },
            specific: { select: { specific_id: true, specific_name: true } },
            asset: { select: { asset_id: true, asset_number: true } },
            sequence: { select: { sequence_id: true, sequence_code: true } },
          },
        },
        softcopy: {
          select: {
            document_number: true,
            category: {
              select: {
                softcopy_category_id: true,
                category_name: true,
                folder_name: true,
                parent_category_id: true,
              },
            },
          },
        },
        assignments: {
          where: { user_id: parsedUserId },
          select: { document_assignment_id: true },
        },
      },
    });

    return documents.map(({ assignments, ...document }) => ({
      ...this.withApiDocumentNumber(document),
      assigned: assignments.length > 0,
    }));
  }

  async addAttachments(
    documentId: string,
    actor: AuthenticatedUser,
    files: Express.Multer.File[],
  ) {
    if (!files.length)
      throw new BadRequestException(
        "Choose at least one scanned document or file.",
      );
    const parsedDocumentId = toBigIntId(documentId, "document_id");
    await this.assertDocumentAccess(parsedDocumentId, actor);
    const document = await this.prisma.document.findUnique({
      where: { document_id: parsedDocumentId },
      include: { hardcopy: true, softcopy: { include: { category: true } } },
    });
    if (!document) throw new NotFoundException("Document not found.");
    if (document.document_type === DocumentType.HARDCOPY) {
      throw new BadRequestException(
        "Hardcopy documents cannot contain scanned documents or file attachments.",
      );
    }
    const attachmentUploadStatuses = new Set<DocumentStatus>([
      DocumentStatus.Draft,
      DocumentStatus.ReturnedForCorrection,
      DocumentStatus.ForNotedBy,
      DocumentStatus.ForPlantManagerApproval,
    ]);
    if (!attachmentUploadStatuses.has(document.status)) {
      throw new ConflictException(
        "Scanned attachments must be added through a Softcopy request before Plant Manager approval.",
      );
    }
    const uploadedBy = toBigIntId(actor.user_id, "current_user_id");
    if (!canManageDocuments(actor)) {
      const canManage = await this.prisma.document.findFirst({
        where: {
          document_id: parsedDocumentId,
          OR: [{ created_by: uploadedBy }, { assignments: { some: { user_id: uploadedBy } } }],
        },
        select: { document_id: true },
      });
      if (!canManage) throw new ForbiddenException("Staff can only attach files to documents they created or that are assigned to them.");
    }
    if (document.softcopy) {
      const revisions = await this.prisma.documentRevision.findMany({
        where: { softcopy_id: document.softcopy.softcopy_id },
        select: { file_name: true, file_size: true },
      });
      const newAttachments = files.filter(
        (file) => !revisions.some((revision) => this.isSameStoredFile(file, revision.file_name, revision.file_size)),
      );
      const duplicateAttachments = files.filter((file) => !newAttachments.includes(file));
      await Promise.all(duplicateAttachments.map((file) => this.removeStoredAttachmentFile(file.path)));
      if (!newAttachments.length) return this.findOne(documentId);
      await this.createSoftcopyAttachments(
        this.prisma,
        document.softcopy.softcopy_id,
        uploadedBy,
        newAttachments,
        document.softcopy.category.folder_name,
      );
    } else {
      throw new BadRequestException("This document has no storage record.");
    }
    return this.findOne(documentId);
  }

  async removeAttachment(documentId: string, attachmentId: string, actor: AuthenticatedUser) {
    const document_id = toBigIntId(documentId, "document_id");
    const attachment_id = toBigIntId(attachmentId, "attachment_id");
    await this.assertDocumentAccess(document_id, actor);
    const [softcopy, hardcopy] = await Promise.all([
      this.prisma.softcopyAttachment.findUnique({ where: { attachment_id }, include: { softcopy: true } }),
      this.prisma.hardcopyAttachment.findUnique({ where: { attachment_id }, include: { hardcopy: true } }),
    ]);
    const attachment = softcopy ? { ...softcopy, document_id: softcopy.softcopy.document_id, kind: "softcopy" as const } : hardcopy ? { ...hardcopy, document_id: hardcopy.hardcopy.document_id, kind: "hardcopy" as const } : null;
    if (!attachment || attachment.document_id !== document_id) throw new NotFoundException("Attachment not found.");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    if (!canManageDocuments(actor) && attachment.uploaded_by !== actorId) throw new ForbiddenException("Only the uploader or a document manager can delete this attachment.");
    if (attachment.kind === "softcopy") await this.prisma.softcopyAttachment.delete({ where: { attachment_id } });
    else await this.prisma.hardcopyAttachment.delete({ where: { attachment_id } });
    const attachmentPath = attachment.file_path as string | undefined;
    if (attachmentPath) {
      const storagePath = this.revisionStoragePath(attachmentPath);
      if (storagePath) await unlink(storagePath).catch(() => undefined);
    }
    return this.findOne(documentId);
  }

  private async resolveHardcopyStorageRoute(
    tx: Prisma.TransactionClient | PrismaService,
    input: {
      area_id: string;
      specific_id?: string | null;
      asset_id?: string | null;
      location_id: string;
    },
  ): Promise<Pick<Prisma.HardcopyDocumentUncheckedCreateInput, "area_id" | "specific_id" | "asset_id" | "location_id">> {
    const locationId = toBigIntId(input.location_id, "location_id");
    const location = await tx.location.findUnique({
      where: { location_id: locationId },
      select: {
        asset_id: true,
        specific_id: true,
        specific: { select: { area_id: true } },
        asset: {
          select: {
            specific_id: true,
            specific: { select: { area_id: true } },
          },
        },
      },
    });

    if (!location) {
      throw new BadRequestException("The selected storage location does not exist.");
    }

    const assetId = location.asset_id ?? (input.asset_id ? toBigIntId(input.asset_id, "asset_id") : null);
    const specificId = location.asset?.specific_id ?? location.specific_id ?? (input.specific_id ? toBigIntId(input.specific_id, "specific_id") : null);
    const areaId = location.asset?.specific?.area_id ?? location.specific?.area_id ?? toBigIntId(input.area_id, "area_id");

    return {
      area_id: areaId,
      location_id: locationId,
      asset_id: assetId,
      specific_id: specificId,
    };
  }

  private async createHardcopyAttachments(
    tx: Prisma.TransactionClient | PrismaService,
    hardcopyId: bigint,
    uploadedBy: bigint,
    files: Express.Multer.File[],
  ) {
    for (const file of files) {
      const storedFilePath = await this.moveAttachmentUpload(file, "hardcopy-scans");
      await tx.hardcopyAttachment.create({
        data: {
          hardcopy_id: hardcopyId,
          file_name: file.originalname,
          file_path: storedFilePath,
          file_size: BigInt(file.size),
          mime_type: file.mimetype,
          uploaded_by: uploadedBy,
        },
      });
    }
  }

  private async createSoftcopyAttachments(
    tx: Prisma.TransactionClient | PrismaService,
    softcopyId: bigint,
    uploadedBy: bigint,
    files: Express.Multer.File[],
    categoryFolder: string,
  ) {
    for (const file of files) {
      const storedFilePath = await this.moveAttachmentUpload(
        file,
        categoryFolder,
      );
      await tx.softcopyAttachment.create({
        data: {
          softcopy_id: softcopyId,
          file_name: file.originalname,
          file_path: storedFilePath,
          file_size: BigInt(file.size),
          mime_type: file.mimetype,
          uploaded_by: uploadedBy,
        },
      });
    }
  }

  private async removeMatchingSoftcopyAttachments(
    softcopyId: bigint,
    revisionFile: Express.Multer.File,
  ) {
    const attachments = (await this.prisma.softcopyAttachment.findMany({
      where: {
        softcopy_id: softcopyId,
        status: {
          in: [
            SoftcopyAttachmentStatus.PendingApproval,
            SoftcopyAttachmentStatus.Approved,
          ],
        },
      },
      select: {
        attachment_id: true,
        file_name: true,
        file_size: true,
        file_path: true,
      },
    })) ?? [];

    const matches = attachments.filter((attachment) => {
      return this.isSameStoredFile(revisionFile, attachment.file_name, attachment.file_size);
    });

    if (!matches.length) return;

    await this.prisma.softcopyAttachment.updateMany({
      where: { attachment_id: { in: matches.map((attachment) => attachment.attachment_id) } },
      data: { status: SoftcopyAttachmentStatus.Cancelled },
    });
    await Promise.all(matches.map((attachment) => this.removeStoredAttachmentFile(attachment.file_path)));
  }

  private isSameStoredFile(file: Express.Multer.File, storedFileName: string, storedFileSize: bigint | null) {
    if (String(storedFileName || '').trim().toLowerCase() !== file.originalname.trim().toLowerCase()) {
      return false;
    }
    if (storedFileSize === null) return true;
    return Number.isFinite(Number(file.size)) && storedFileSize === BigInt(file.size);
  }

  private async removeStoredAttachmentFile(filePath: string) {
    const attachmentPath = this.attachmentStoragePath(filePath);
    const legacyRevisionPath = this.revisionStoragePath(filePath);
    const existingPath = await this.firstExistingFile([
      filePath,
      join(attachmentUploadsRoot, attachmentPath || ""),
      join(revisionUploadsRoot, legacyRevisionPath || ""),
    ]);
    if (existingPath) await unlink(existingPath).catch(() => undefined);
  }

  async setUserAssignments(
    userId: string,
    documentIds: string[],
    actor: AuthenticatedUser,
  ) {
    this.assertAdministrativeActor(actor);
    const parsedUserId = toBigIntId(userId, "user_id");
    const assignedBy = toBigIntId(actor.user_id, "current_user_id");
    const uniqueDocumentIds = [
      ...new Set(documentIds.map((id) => toBigIntId(id, "document_id"))),
    ];
    const [user, documents] = await Promise.all([
      this.prisma.user.findUnique({
        where: { user_id: parsedUserId },
        select: { user_id: true },
      }),
      this.prisma.document.findMany({
        where: { document_id: { in: uniqueDocumentIds } },
        select: { document_id: true },
      }),
    ]);
    if (!user) throw new NotFoundException("User was not found.");
    if (documents.length !== uniqueDocumentIds.length)
      throw new BadRequestException(
        "One or more selected documents do not exist.",
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.documentAssignment.deleteMany({
        where: { user_id: parsedUserId },
      });
      if (uniqueDocumentIds.length) {
        await tx.documentAssignment.createMany({
          data: uniqueDocumentIds.map((documentId) => ({
            document_id: documentId,
            user_id: parsedUserId,
            assigned_by: assignedBy,
          })),
        });
      }
    });

    return { user_id: parsedUserId, document_ids: uniqueDocumentIds };
  }

  private assertAdministrativeActor(actor: AuthenticatedUser) {
    if (!canManageDocuments(actor)) {
      throw new ForbiddenException(
        "Only a document manager can manage document assignments.",
      );
    }
  }

  private documentAccessWhere(
    user?: AuthenticatedUser,
  ): Prisma.DocumentWhereInput {
    if (!user || canManageDocuments(user)) return {};
    return {
      assignments: {
        some: { user_id: toBigIntId(user.user_id, "current_user_id") },
      },
    };
  }

  private isAdministrativeRole(roleName: string) {
    return isAdministrativeRole(roleName);
  }

  private async assertDocumentAccess(
    documentId: bigint,
    user?: AuthenticatedUser,
  ) {
    if (!user) return;
    const document = await this.prisma.document.findFirst({
      where: { document_id: documentId, OR: [this.documentAccessWhere(user), this.approvalQueueWhere(user)] },
      select: { document_id: true },
    });
    if (!document)
      throw new NotFoundException(
        "Document was not found or is not assigned to you.",
      );
  }

  async organizeRevisionStorage(documentId?: bigint) {
    const revisions = await this.prisma.documentRevision.findMany({
      where: documentId ? { softcopy: { document_id: documentId } } : undefined,
      include: {
        softcopy: { include: { category: true } },
      },
    });

    for (const revision of revisions) {
      const filename =
        revision.file_path.replace(/\\/g, "/").split("/").pop() ||
        revision.file_name;
      const categoryRoot = ensureRevisionCategoryUploadsRoot(
        revision.softcopy.category.folder_name,
      );
      const targetPath = join(categoryRoot, filename);
      const sourcePath = await this.firstExistingFile([
        revision.file_path,
        join(revisionUploadsRoot, filename),
        targetPath,
      ]);

      if (!sourcePath) continue;
      if (sourcePath !== targetPath) {
        await rename(sourcePath, targetPath);
      }
      if (revision.file_path !== targetPath) {
        await this.prisma.documentRevision.update({
          where: { revision_id: revision.revision_id },
          data: { file_path: targetPath },
        });
      }
    }

    const attachments = await this.prisma.softcopyAttachment.findMany({
      where: documentId ? { softcopy: { document_id: documentId } } : undefined,
      include: {
        softcopy: { include: { category: true } },
      },
    });

    const revisionFilePaths = new Set(
      revisions.map((revision) => revision.file_path.replace(/\\/g, "/").toLowerCase()),
    );

    for (const attachment of attachments) {
      if (
        revisionFilePaths.has(
          attachment.file_path.replace(/\\/g, "/").toLowerCase(),
        )
      ) {
        continue;
      }
      const filename =
        attachment.file_path.replace(/\\/g, "/").split("/").pop() ||
        attachment.file_name;
      const categoryRoot = ensureAttachmentCategoryUploadsRoot(
        attachment.softcopy.category.folder_name,
      );
      const targetPath = join(categoryRoot, filename);
      const sourcePath = await this.firstExistingFile([
        attachment.file_path,
        join(attachmentUploadsRoot, filename),
        join(revisionUploadsRoot, filename),
        targetPath,
      ]);

      if (!sourcePath) continue;
      if (sourcePath !== targetPath) {
        await rename(sourcePath, targetPath);
      }
      if (attachment.file_path !== targetPath) {
        await this.prisma.softcopyAttachment.update({
          where: { attachment_id: attachment.attachment_id },
          data: { file_path: targetPath },
        });
      }
    }

    return { organized: revisions.length + attachments.length };
  }

  private withRevisionUrls<T>(
    value: T,
    fileKind: "revision" | "attachment" = "revision",
  ): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.withRevisionUrls(item, fileKind)) as T;
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    const clone = { ...(value as Record<string, unknown>) };

    const storedFilename =
      typeof clone.file_path === "string" && clone.file_path.length
        ? fileKind === "attachment"
          ? this.attachmentStoragePath(clone.file_path)
          : this.revisionStoragePath(clone.file_path)
        : undefined;
    const publicFilename =
      storedFilename ||
      (typeof clone.file_name === "string" && clone.file_name.length
        ? clone.file_name
        : undefined);

    if (
      publicFilename &&
      clone.status !== SoftcopyAttachmentStatus.Rejected &&
      clone.status !== SoftcopyAttachmentStatus.Cancelled
    ) {
      const isLegacyAttachment =
        fileKind === "attachment" &&
        typeof clone.file_path === "string" &&
        !/[/\\]uploads[/\\]attachments[/\\]/i.test(clone.file_path);
      clone.file_url = isLegacyAttachment
        ? buildRevisionPublicUrl(publicFilename)
        : fileKind === "attachment"
          ? buildAttachmentPublicUrl(publicFilename)
          : buildRevisionPublicUrl(publicFilename);
    }

    if (clone.current_revision) {
      clone.current_revision = this.withRevisionUrls(clone.current_revision);
    }

    if (Array.isArray(clone.revisions)) {
      clone.revisions = clone.revisions.map((revision) =>
        this.withRevisionUrls(revision),
      );
    }

    if (Array.isArray(clone.attachments)) {
      clone.attachments = clone.attachments.map((attachment) =>
        this.withRevisionUrls(attachment, "attachment"),
      );
    }

    if (clone.softcopy && typeof clone.softcopy === "object") {
      clone.softcopy = this.withRevisionUrls(clone.softcopy);
    }

    if (clone.hardcopy && typeof clone.hardcopy === "object") {
      clone.hardcopy = this.withRevisionUrls(clone.hardcopy);
    }

    return clone as T;
  }

  private withApiDocumentNumber<T>(value: T): T {
    if (!value || typeof value !== "object") return value;
    const clone = { ...(value as Record<string, unknown>) };
    const softcopy = clone.softcopy;
    clone.document_number =
      clone.document_type === DocumentType.SOFTCOPY &&
      softcopy &&
      typeof softcopy === "object"
        ? ((softcopy as Record<string, unknown>).document_number ?? null)
        : null;
    return clone as T;
  }

  private revisionStoragePath(filePath: string) {
    const normalized = filePath.replace(/\\/g, "/");
    const marker = "/uploads/revisions/";
    const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
    if (markerIndex >= 0) {
      return normalized.slice(markerIndex + marker.length);
    }
    return normalized.split("/").pop();
  }

  private attachmentStoragePath(filePath: string) {
    const normalized = filePath.replace(/\\/g, "/");
    const marker = "/uploads/attachments/";
    const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
    if (markerIndex >= 0) {
      return normalized.slice(markerIndex + marker.length);
    }
    return this.revisionStoragePath(filePath);
  }

  private async moveRevisionUpload(
    file: Express.Multer.File,
    categoryFolder: string,
  ) {
    const categoryRoot = ensureRevisionCategoryUploadsRoot(categoryFolder);
    const storedFilePath = join(categoryRoot, file.filename);
    await rename(file.path, storedFilePath);
    return storedFilePath;
  }

  private async moveAttachmentUpload(
    file: Express.Multer.File,
    categoryFolder: string,
  ) {
    const categoryRoot = ensureAttachmentCategoryUploadsRoot(categoryFolder);
    const storedFilePath = join(categoryRoot, file.filename);
    await rename(file.path, storedFilePath);
    return storedFilePath;
  }

  private async firstExistingFile(candidates: string[]) {
    for (const candidate of [...new Set(candidates.filter(Boolean))]) {
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch {
        // Continue through historical and category-based storage paths.
      }
    }
    return "";
  }

  private async resolveSoftcopyCategoryId(
    client: Prisma.TransactionClient | PrismaService,
    categoryId?: string,
  ) {
    if (categoryId) {
      const parsedCategoryId = toBigIntId(categoryId, "softcopy_category_id");
      const category = await client.softcopyCategory.findUnique({
        where: { softcopy_category_id: parsedCategoryId },
      });
      if (!category || !category.is_active) {
        throw new BadRequestException("Select an active softcopy folder or subfolder.");
      }
      return parsedCategoryId;
    }

    const defaultCategory = await client.softcopyCategory.findUnique({
      where: { folder_name: "uncategorized" },
    });
    if (!defaultCategory) {
      throw new BadRequestException(
        "The default softcopy folder is not configured.",
      );
    }
    return defaultCategory.softcopy_category_id;
  }

  private folderCategoryKey(parentId: bigint | null, categoryName: string) {
    return `${parentId?.toString() ?? "root"}|${this.normalizeLookup(categoryName)}`;
  }

  private async resolveFolderCategoryPath(
    pathParts: string[],
    categoryMap: Map<string, FolderCategoryReference>,
  ) {
    let parentId: bigint | null = null;
    let parentFolderName = "";
    let resolvedCategory: FolderCategoryReference | null = null;
    for (const rawPart of pathParts) {
      const categoryName = rawPart.slice(0, 150);
      const key = this.folderCategoryKey(parentId, categoryName);
      let category = categoryMap.get(key);
      if (!category) {
        const baseFolder = [
          parentFolderName,
          this.slugifyFolderPart(categoryName),
        ]
          .filter(Boolean)
          .join("/")
          .slice(0, 150);
        let folderName = baseFolder;
        let suffix = 2;
        while (
          await this.prisma.softcopyCategory.findUnique({
            where: { folder_name: folderName },
          })
        ) {
          folderName = `${baseFolder.slice(0, 145)}-${suffix++}`;
        }
        category = await this.prisma.softcopyCategory.create({
          data: {
            category_name: categoryName,
            folder_name: folderName,
            parent_category_id: parentId,
            description: `Created automatically from uploaded folder ${pathParts.join(" / ")}.`,
          },
          select: {
            softcopy_category_id: true,
            category_name: true,
            folder_name: true,
            parent_category_id: true,
          },
        });
        categoryMap.set(key, category);
      }
      parentId = category.softcopy_category_id;
      parentFolderName = category.folder_name;
      resolvedCategory = category;
    }
    return resolvedCategory!;
  }

  private slugifyFolderPart(value: string) {
    return (
      value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "folder"
    );
  }

  private async getNextRevisionNumber(softcopyId: bigint) {
    const latestRevision = await this.prisma.documentRevision.findFirst({
      where: { softcopy_id: softcopyId },
      orderBy: { revision_id: "desc" },
      select: { revision_number: true },
    });

    if (!latestRevision) {
      return "000";
    }

    const currentRevisionNumber = Number(latestRevision.revision_number);
    const nextRevisionNumber = Number.isNaN(currentRevisionNumber)
      ? 0
      : currentRevisionNumber + 1;

    return nextRevisionNumber.toString().padStart(3, "0");
  }

  private scoreDocumentMatch(document: any, query: string) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    if (!terms.length) {
      return 0;
    }

    const haystack = [
      document.document_number,
      document.document_title,
      document.document_type,
      document.status,
      document.requested_by_name,
      document.disposal_remarks,
      document.disposed_by_name,
      [document.requester?.firstname, document.requester?.lastname]
        .filter(Boolean)
        .join(" "),
      document.hardcopy?.asset?.asset_number,
      document.hardcopy?.area?.area_name,
      document.hardcopy?.specific?.specific_name,
      document.hardcopy?.location?.location_name,
      document.hardcopy?.sequence?.sequence_code,
      document.softcopy?.current_revision?.file_name,
      document.softcopy?.category?.category_name,
      [document.creator?.firstname, document.creator?.lastname]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;

    for (const term of terms) {
      if (document.document_number?.toLowerCase().includes(term)) {
        score += 10;
      }

      if (document.document_title?.toLowerCase().includes(term)) {
        score += 8;
      }

      if (haystack.includes(term)) {
        score += 3;
      }
    }

    return score;
  }

  private async buildAssistantSummary(
    query: string,
    matches: any[],
    publicOnly = false,
  ) {
    const apiKey = process.env.MISTRAL_API_KEY?.trim();
    const model = process.env.MISTRAL_MODEL?.trim() || "mistral-small-latest";
    const apiUrl =
      process.env.MISTRAL_API_URL?.trim() ||
      "https://api.mistral.ai/v1/chat/completions";
    const enabled = (process.env.MISTRAL_ENABLED ?? "true") !== "false";
    const timeoutMs = Number(process.env.MISTRAL_TIMEOUT_MS ?? "10000");

    if (!enabled || !apiKey) {
      return {
        configured: false,
        provider: "local",
        answer: publicOnly
          ? this.localPublicAssistantFallback(query, matches)
          : this.localAssistantFallback(query, matches),
      };
    }

    const context = matches.length
      ? matches
          .map(
            (document: any, index: number) =>
              `${index + 1}. ${document.document_number} | ${
                document.document_title
              } | ${document.document_type} | ${document.status ?? "N/A"} | ` +
              (publicOnly
                ? `Category: ${document.softcopy?.category?.category_name ?? "N/A"} | `
                : `Requested by: ${
                    document.requested_by_name ??
                    ([
                      document.requester?.firstname,
                      document.requester?.lastname,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                      "N/A")
                  } | Disposal remarks: ${document.disposal_remarks ?? "N/A"} | `) +
              `Area: ${document.hardcopy?.area?.area_name ?? "N/A"} | ` +
              `Location: ${
                document.hardcopy?.location?.location_name ?? "N/A"
              } | ` +
              `Asset: ${document.hardcopy?.asset?.asset_number ?? "N/A"} | ` +
              `Current file: ${
                document.softcopy?.current_revision?.file_name ?? "N/A"
              }`,
          )
          .join("\n")
      : "No direct matches were found.";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;

      try {
        response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              {
                role: "system",
                content: publicOnly
                  ? "You are a concise public document-search assistant. Use only the approved public document context provided. Do not infer or request private workflow, ownership, or storage information. If no match exists, say so briefly."
                  : "You are a concise document-search assistant. Use only the provided document context. If no match exists, say so briefly.",
              },
              {
                role: "user",
                content: `User query: ${query}\n\nDocument context:\n${context}\n\nGive a short helpful answer and mention the best matching document numbers when relevant.`,
              },
            ],
          }),
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return {
          configured: true,
          provider: "local",
          answer: publicOnly
            ? this.localPublicAssistantFallback(query, matches)
            : this.localAssistantFallback(query, matches),
        };
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const answer = payload.choices?.[0]?.message?.content?.trim();

      return {
        configured: true,
        provider: "mistral",
        answer:
          answer ||
          (publicOnly
            ? this.localPublicAssistantFallback(query, matches)
            : this.localAssistantFallback(query, matches)),
      };
    } catch {
      return {
        configured: true,
        provider: "local",
        answer: publicOnly
          ? this.localPublicAssistantFallback(query, matches)
          : this.localAssistantFallback(query, matches),
      };
    }
  }

  private localPublicAssistantFallback(query: string, matches: any[]) {
    if (!matches.length) {
      return `No approved public documents closely matched "${query}". Try a document number, title, area, location, asset number, category, or file name.`;
    }

    const topMatches = matches
      .slice(0, 3)
      .map((document: any) => document.document_number)
      .join(", ");

    return `I found ${matches.length} approved public document${matches.length === 1 ? "" : "s"} related to "${query}". The strongest matches are ${topMatches}. Select a result to view its public details.`;
  }

  private publicAssistantSuggestions(matches: any[]) {
    const dynamic = matches.flatMap((document: any) => [
      document.document_title,
      document.hardcopy?.area?.area_name,
      document.hardcopy?.location?.location_name,
      document.softcopy?.category?.category_name,
    ]);

    return [...new Set(dynamic.filter(Boolean))].slice(0, 4);
  }

  private localAssistantFallback(query: string, matches: any[]) {
    if (!matches.length) {
      return `Local document search did not find a close match for "${query}". Try a document number, title, disposal remark, area, asset number, or current file name.`;
    }

    const topMatches = matches
      .slice(0, 3)
      .map((document: any) => document.document_number)
      .join(", ");

    return `Local document search found these best matches for "${query}": ${topMatches}. Open one for full details, disposal data, or revision history.`;
  }

  private buildBatchFingerprint(row: BatchHardcopyImportRowDto) {
    return [
      row.document_name,
      row.location_name,
      this.normalizeAssetLookup(row.asset_number),
      row.area_name,
      row.specific_name,
      row.sequence,
    ]
      .map((value) =>
        typeof value === "string" ? this.normalizeLookup(value) : value,
      )
      .join("|");
  }

  private normalizeLookup(value: string | null | undefined) {
    return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  private resolveRetentionData(
    dto: Pick<CreateDocumentDto, "retention_enabled" | "retention_start_date" | "retention_end_date">,
    partial = false,
  ): Pick<
    Prisma.HardcopyDocumentUncheckedCreateInput,
    "retention_enabled" | "retention_start_date" | "retention_end_date"
  > {
    const touched =
      dto.retention_enabled !== undefined ||
      dto.retention_start_date !== undefined ||
      dto.retention_end_date !== undefined;
    if (partial && !touched) return {};

    const enabled =
      dto.retention_enabled === true ||
      String(dto.retention_enabled ?? "false").toLowerCase() === "true";
    if (!enabled) {
      return {
        retention_enabled: false,
        retention_start_date: null,
        retention_end_date: null,
      };
    }

    if (!dto.retention_start_date || !dto.retention_end_date) {
      throw new BadRequestException(
        "A retention start date and end date are required when retention is enabled.",
      );
    }

    const start = new Date(dto.retention_start_date);
    const end = new Date(dto.retention_end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException(
        "The retention end date must be on or after the retention start date.",
      );
    }

    return {
      retention_enabled: true,
      retention_start_date: start,
      retention_end_date: end,
    };
  }

  private resolveDisposalAction(action: DisposalAction | null | undefined) {
    if (!action) return DisposalAction.Other;
    if (!Object.values(DisposalAction).includes(action)) {
      throw new BadRequestException("Select a valid disposal action.");
    }
    return action;
  }

  private resolveDisposalActionOther(dto: {
    disposal_action?: DisposalAction | null;
    disposal_action_other?: string | null;
    disposal_remarks?: string | null;
  }) {
    const action = this.resolveDisposalAction(dto.disposal_action);
    const explanation = dto.disposal_action_other?.trim();
    if (action === DisposalAction.Other) {
      return explanation || dto.disposal_remarks?.trim() || null;
    }
    return null;
  }

  private retentionDuration(from: Date, to: Date) {
    let cursor = new Date(from);
    let years = 0;
    let months = 0;
    while (this.addUtcYears(cursor, 1) <= to && years < 1200) {
      cursor = this.addUtcYears(cursor, 1);
      years += 1;
    }
    while (this.addUtcMonths(cursor, 1) <= to && months < 12) {
      cursor = this.addUtcMonths(cursor, 1);
      months += 1;
    }
    const days = Math.max(0, Math.floor((to.getTime() - cursor.getTime()) / 86_400_000));
    return { years, months, days };
  }

  private addUtcYears(value: Date, amount: number) {
    const result = new Date(value);
    result.setUTCFullYear(result.getUTCFullYear() + amount);
    return result;
  }

  private addUtcMonths(value: Date, amount: number) {
    const result = new Date(value);
    result.setUTCMonth(result.getUTCMonth() + amount);
    return result;
  }

  private startOfUtcDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private withHardcopyRetention<T>(value: T): T {
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, any>;
    if (!record.hardcopy || typeof record.hardcopy !== "object") return value;

    const hardcopy = record.hardcopy as Record<string, any>;
    const enabled = Boolean(hardcopy.retention_enabled && hardcopy.retention_end_date);
    const endDate = hardcopy.retention_end_date ? new Date(hardcopy.retention_end_date) : null;
    const startDate = hardcopy.retention_start_date ? new Date(hardcopy.retention_start_date) : null;
    const today = this.startOfUtcDay(new Date());
    const end = endDate ? this.startOfUtcDay(endDate) : null;
    const expired = Boolean(enabled && end && end < today);
    const remaining = enabled && end && !expired ? this.retentionDuration(today, end) : { years: 0, months: 0, days: 0 };
    const totalDays = enabled && end ? Math.floor((end.getTime() - today.getTime()) / 86_400_000) : null;
    const durationLabel = `${remaining.years} year${remaining.years === 1 ? "" : "s"}, ${remaining.months} month${remaining.months === 1 ? "" : "s"}, ${remaining.days} day${remaining.days === 1 ? "" : "s"}`;

    hardcopy.retention = {
      enabled,
      start_date: startDate?.toISOString() ?? null,
      end_date: end?.toISOString() ?? null,
      years: remaining.years,
      months: remaining.months,
      days: remaining.days,
      days_remaining: totalDays,
      label: !enabled ? "No retention" : expired ? "Retention expired" : `${durationLabel} remaining`,
      guidance: !enabled
        ? "Guide: No retention period is set for this hardcopy."
        : expired
          ? "Alert: Retention period expired. Review this hardcopy for disposal."
          : totalDays !== null && totalDays <= 30
            ? `Alert: Retention ends in ${durationLabel}.`
            : `Guide: Retention remaining ${durationLabel}.`,
    };
    return value;
  }

  private resolveRequestedByUserId(
    dto: { requested_by_user_id?: string },
    fallbackUserId: bigint,
  ) {
    return dto.requested_by_user_id
      ? toBigIntId(dto.requested_by_user_id, "requested_by_user_id")
      : fallbackUserId;
  }

  private buildWorkflowStateCreateData(
    status: DocumentStatus,
    dto: {
      disposal_remarks?: string | null;
      disposal_action?: DisposalAction | null;
      disposal_action_other?: string | null;
      disposed_by_name?: string | null;
      disposed_by_user_id?: string | null;
    },
    previousStatus?: DocumentStatus | null,
  ): Pick<
    Prisma.DocumentUncheckedCreateInput,
    | "status"
    | "status_before_disposal"
    | "disposal_remarks"
    | "disposal_action"
    | "disposal_action_other"
    | "disposed_at"
    | "disposed_by_name"
    | "disposed_by_user_id"
  > {
    if (status === DocumentStatus.Disposed) {
      const disposalRemarks = dto.disposal_remarks?.trim();
      if (!disposalRemarks) {
        throw new BadRequestException(
          "Disposed documents require disposal remarks.",
        );
      }

      return {
        status,
        status_before_disposal:
          previousStatus && previousStatus !== DocumentStatus.Disposed
            ? previousStatus
            : DocumentStatus.Approved,
        disposal_remarks: disposalRemarks,
        disposal_action: this.resolveDisposalAction(dto.disposal_action),
        disposal_action_other: this.resolveDisposalActionOther({
          disposal_action: dto.disposal_action,
          disposal_action_other: dto.disposal_action_other,
          disposal_remarks: disposalRemarks,
        }),
        disposed_at: new Date(),
        disposed_by_name: dto.disposed_by_name?.trim() || null,
        disposed_by_user_id: dto.disposed_by_user_id
          ? toBigIntId(dto.disposed_by_user_id, "disposed_by_user_id")
          : null,
      };
    }

    return {
      status,
      status_before_disposal: null,
      disposal_remarks: null,
      disposal_action: null,
      disposal_action_other: null,
      disposed_at: null,
      disposed_by_name: null,
      disposed_by_user_id: null,
    };
  }

  private buildWorkflowStateUpdateData(
    status: DocumentStatus,
    dto: {
      disposal_remarks?: string | null;
      disposal_action?: DisposalAction | null;
      disposal_action_other?: string | null;
      disposed_by_name?: string | null;
      disposed_by_user_id?: string | null;
    },
    previousStatus?: DocumentStatus | null,
  ): Pick<
    Prisma.DocumentUncheckedUpdateInput,
    | "status"
    | "status_before_disposal"
    | "disposal_remarks"
    | "disposal_action"
    | "disposal_action_other"
    | "disposed_at"
    | "disposed_by_name"
    | "disposed_by_user_id"
  > {
    return {
      ...this.buildWorkflowStateCreateData(status, dto, previousStatus),
    };
  }

  private normalizeAssetLookup(value: string | null | undefined) {
    return this.normalizeLookup(value).replace(/[^a-z0-9]+/g, "");
  }

  private extractDocxText(buffer: Buffer) {
    const archive = new AdmZip(buffer);
    const xml = archive
      .getEntries()
      .filter((entry) =>
        /^word\/(?:document|header\d*|footer\d*)\.xml$/i.test(entry.entryName),
      )
      .map((entry) => entry.getData().toString("utf8"))
      .join("\n");

    return xml
      .replace(/<w:tab\/?\s*>/gi, "\t")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  private buildSpecificLookupKey(
    specificName: string | null | undefined,
    areaId: bigint | null | undefined,
  ) {
    return `${this.normalizeLookup(specificName)}|${areaId?.toString() ?? ""}`;
  }

  private resolveBatchDocumentTitle(row: BatchHardcopyImportRowDto) {
    const documentTitle = row.document_name?.trim();
    if (documentTitle) {
      return documentTitle.toUpperCase();
    }

    return `UNTITLED IMPORTED HARDCOPY ROW ${String(row.row_number).padStart(
      3,
      "0",
    )}`;
  }

  private resolveBatchRequiredLabel(
    value: string | null | undefined,
    fallback: string,
  ) {
    const normalizedValue = value?.trim();
    return normalizedValue || fallback;
  }

  private async resolveBatchArea(
    tx: Prisma.TransactionClient,
    areaMap: Map<string, BatchAreaReference>,
    areaName: string,
  ) {
    const resolvedAreaName = this.resolveBatchRequiredLabel(
      areaName,
      "UNSPECIFIED AREA",
    );
    const normalizedName = this.normalizeLookup(resolvedAreaName);
    const existingArea = areaMap.get(normalizedName);
    if (existingArea) {
      return existingArea;
    }

    const createdArea = await tx.area.create({
      data: {
        area_name: resolvedAreaName,
      },
      select: {
        area_id: true,
        area_name: true,
      },
    });
    areaMap.set(normalizedName, createdArea);
    return createdArea;
  }

  private async resolveBatchLocation(
    tx: Prisma.TransactionClient,
    locationMap: Map<string, BatchLocationReference>,
    locationName: string,
  ) {
    const resolvedLocationName = this.resolveBatchRequiredLabel(
      locationName,
      "UNSPECIFIED LOCATION",
    );
    const normalizedName = this.normalizeLookup(resolvedLocationName);
    const existingLocation = locationMap.get(normalizedName);
    if (existingLocation) {
      return existingLocation;
    }

    const createdLocation = await tx.location.create({
      data: {
        location_name: resolvedLocationName,
      },
      select: {
        location_id: true,
        location_name: true,
      },
    });
    locationMap.set(normalizedName, createdLocation);
    return createdLocation;
  }

  private async resolveBatchSpecific(
    tx: Prisma.TransactionClient,
    specificMap: Map<string, BatchSpecificReference>,
    specificName: string | null | undefined,
    areaId: bigint,
  ) {
    if (!specificName?.trim()) {
      return null;
    }

    const lookupKey = this.buildSpecificLookupKey(specificName, areaId);
    const existingSpecific = specificMap.get(lookupKey);
    if (existingSpecific) {
      return existingSpecific;
    }

    const createdSpecific = await tx.specific.create({
      data: {
        specific_name: specificName.trim(),
        area_id: areaId,
      },
      select: {
        specific_id: true,
        specific_name: true,
        area_id: true,
      },
    });
    specificMap.set(lookupKey, createdSpecific);
    return createdSpecific;
  }

  private async resolveBatchSequence(
    tx: Prisma.TransactionClient,
    sequenceMap: Map<string, BatchSequenceReference>,
    sequenceCode: string | null | undefined,
  ) {
    if (!sequenceCode?.trim()) {
      return null;
    }

    const normalizedCode = this.normalizeLookup(sequenceCode);
    const existingSequence = sequenceMap.get(normalizedCode);
    if (existingSequence) {
      return existingSequence;
    }

    const createdSequence = await tx.sequence.create({
      data: {
        sequence_code: sequenceCode.trim(),
      },
      select: {
        sequence_id: true,
        sequence_code: true,
      },
    });
    sequenceMap.set(normalizedCode, createdSequence);
    return createdSequence;
  }

  private async resolveBatchAsset(
    tx: Prisma.TransactionClient,
    assetMap: Map<string, BatchAssetReference>,
    assetNumber: string | null | undefined,
  ) {
    if (!assetNumber?.trim()) {
      return null;
    }

    const normalizedAsset = this.normalizeAssetLookup(assetNumber);
    const existingAsset = assetMap.get(normalizedAsset);
    if (existingAsset) {
      return existingAsset;
    }

    const createdAsset = await tx.assetNumber.create({
      data: {
        asset_number: assetNumber.trim(),
      },
      select: {
        asset_id: true,
        asset_number: true,
      },
    });
    assetMap.set(normalizedAsset, createdAsset);
    return createdAsset;
  }

  private async parseBatchWorkbook(filePath: string) {
    const workbook = XLSX.readFile(filePath, {
      raw: false,
      dense: true,
    });
    const rows: BatchHardcopyImportRowDto[] = [];
    const requiredHeaders = [
      "SEQUENCE",
      "DOCUMENT NAME",
      "LOCATION",
      "ASSET NUMBER",
      "AREA",
      "SPECIFIC",
    ];
    let matchedSheet = false;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        continue;
      }

      const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(
        sheet,
        {
          header: 1,
          raw: false,
          defval: "",
          blankrows: false,
        },
      );

      const headerRow = (matrix[0] ?? []).map((value) =>
        this.normalizeWorkbookCell(value).toUpperCase(),
      );
      if (!requiredHeaders.every((header) => headerRow.includes(header))) {
        continue;
      }

      matchedSheet = true;
      const headerIndex = new Map(
        headerRow.map((header, index) => [header, index]),
      );

      for (let index = 2; index < matrix.length; index += 1) {
        const row = matrix[index] ?? [];
        const parsedRow: BatchHardcopyImportRowDto = {
          sheet_name: sheetName,
          row_number: index + 1,
          sequence: this.readWorkbookCell(row, headerIndex, "SEQUENCE"),
          document_name: this.readWorkbookCell(
            row,
            headerIndex,
            "DOCUMENT NAME",
          ),
          location_name: this.readWorkbookCell(row, headerIndex, "LOCATION"),
          asset_number: this.readWorkbookCell(row, headerIndex, "ASSET NUMBER"),
          area_name: this.readWorkbookCell(row, headerIndex, "AREA"),
          specific_name: this.readWorkbookCell(row, headerIndex, "SPECIFIC"),
        };

        if (!this.hasBatchRowContent(parsedRow)) {
          continue;
        }

        rows.push(parsedRow);
      }
    }

    if (!matchedSheet) {
      throw new BadRequestException(
        "Invalid Column Structure: expected headers SEQUENCE, DOCUMENT NAME, LOCATION, ASSET NUMBER, AREA, and SPECIFIC.",
      );
    }

    return rows;
  }

  private readWorkbookCell(
    row: (string | number | null)[],
    headerIndex: Map<string, number>,
    header: string,
  ) {
    const index = headerIndex.get(header);
    return index === undefined ? "" : this.normalizeWorkbookCell(row[index]);
  }

  private readWorkbookCellAliases(
    row: (string | number | null)[],
    headerIndex: Map<string, number>,
    headers: string[],
  ) {
    for (const header of headers) {
      const value = this.readWorkbookCell(row, headerIndex, header);
      if (value) return value;
    }
    return "";
  }

  private normalizeWorkbookCell(value: string | number | null | undefined) {
    return value === undefined || value === null
      ? ""
      : String(value).replace(/\s+/g, " ").trim();
  }

  private hasBatchRowContent(row: BatchHardcopyImportRowDto) {
    return !!(
      row.document_name ||
      row.location_name ||
      row.asset_number ||
      row.area_name ||
      row.specific_name ||
      row.sequence
    );
  }

  private extractBatchErrorMessage(error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      return `Database Failure: ${(error as { message: string }).message}`;
    }

    return "Unknown System Error: unexpected batch import failure.";
  }

  private async deleteUploadedBatchFile(filePath: string) {
    try {
      await unlink(filePath);
    } catch {
      return;
    }
  }
}
