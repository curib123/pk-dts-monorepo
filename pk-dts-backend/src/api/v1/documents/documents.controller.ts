import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  StreamableFile,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { createReadStream } from "fs";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { RequirePermissions } from "../../../common/auth/require-permissions.decorator";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { DocumentListQueryDto } from "./dto/document-list-query.dto";
import { diskStorage, memoryStorage } from "multer";
import {
  attachmentUploadsRoot,
  createAttachmentFilename,
  createRevisionFilename,
  batchImportUploadsRoot,
  createBatchImportFilename,
  ensureBatchImportUploadsRoot,
  ensureAttachmentUploadsRoot,
  ensureRevisionUploadsRoot,
  revisionUploadsRoot,
} from "../../../config/upload-paths";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { BatchHardcopyUploadDto } from "./dto/batch-hardcopy-upload.dto";
import { DisposeDocumentDto } from "./dto/dispose-document.dto";
import { CreateRevisionDto } from "./dto/create-revision.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { ChangeDocumentDirectoryDto } from "./dto/change-document-directory.dto";
import { DocumentsService } from "./documents.service";
import { DocumentStatus } from "@prisma/client";
import { WorkflowActionDto } from "./dto/workflow-action.dto";
import { BatchSoftcopyFolderUploadDto } from "./dto/batch-softcopy-folder-upload.dto";
import { AssignDocumentUsersDto } from "./dto/assign-document-users.dto";
import { AssignUserDocumentsDto } from "./dto/assign-user-documents.dto";
import { ConfigureDocumentApproversDto } from "./dto/configure-document-approvers.dto";
import { ReassignWorkflowStepDto } from "./dto/reassign-workflow-step.dto";
import { DocumentAssistantQueryDto } from "./dto/document-assistant-query.dto";
import { isAdministrativeRole } from "../../../common/auth/administrative-role.util";
import {
  canManageDocuments,
  DOCUMENT_APPROVAL_PERMISSIONS,
  DOCUMENT_REVIEW_PERMISSIONS,
  DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION,
  hasPermission,
} from "../../../common/auth/document-workflow-permissions";

const BATCH_IMPORT_MAX_FILE_SIZE_BYTES =
  Number(process.env.BATCH_HARDCOPY_MAX_FILE_SIZE_BYTES) || 10 * 1024 * 1024;
const SOFTCOPY_MAX_FILE_SIZE_BYTES =
  Number(process.env.SOFTCOPY_MAX_FILE_SIZE_BYTES) || 100 * 1024 * 1024;

@ApiTags("Documents")
@Controller({
  path: "documents",
  version: "1",
})
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @RequirePermissions(
    "documents.view",
    "document-requests.view",
    "document-disposal.view",
  )
  @ApiOperation({ summary: "List documents" })
  @ApiOkResponse({ description: "Documents retrieved successfully." })
  findAll(@Query() query: DocumentListQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.documentsService.findAll(
      query,
      [DocumentStatus.Approved, DocumentStatus.Completed],
      user!,
    );
  }

  @Get("disposed")
  @RequirePermissions("document-disposal.view")
  @ApiOperation({ summary: "List disposed documents" })
  @ApiOkResponse({ description: "Disposed documents retrieved successfully." })
  findDisposed(@Query() query: DocumentListQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.documentsService.findAll(query, [DocumentStatus.Disposed], user!);
  }

  @Get("requests/mine")
  @RequirePermissions("document-requests.view-own")
  myRequests(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.findMyRequests(user!.user_id, query);
  }

  @Get("requests/pending")
  pendingRequests(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.findApprovalQueue(query, user!);
  }

  @Get(":id/approval-view")
  @ApiOperation({ summary: "Inspect a document assigned to the current reviewer" })
  approvalView(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.findApprovalDocument(id, user);
  }

  @Get(":id")
  @RequirePermissions(
    "documents.view",
    "document-requests.view",
    "document-requests.view-own",
    "document-disposal.view",
  )
  @ApiOperation({ summary: "Get document details" })
  @ApiOkResponse({ description: "Document retrieved successfully." })
  findOne(@Param("id") id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.documentsService.findOne(id, user!);
  }

  @Get(":id/revisions/:revisionId/stamped")
  @RequirePermissions("documents.download")
  @ApiOperation({ summary: "Download a status-stamped Softcopy Office revision" })
  async stampedRevision(
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const stamped = await this.documentsService.getStampedRevision(
      id,
      revisionId,
      user!,
    );
    return new StreamableFile(createReadStream(stamped.filePath), {
      type: stamped.mimeType,
      disposition: `attachment; filename="${stamped.filename}"`,
      length: stamped.fileSize,
    });
  }

  @Get(":id/revisions/:revisionId/uncontrolled")
  @RequirePermissions("documents.download")
  @ApiOperation({ summary: "Download an uncontrolled copy of a Softcopy Office revision" })
  async uncontrolledRevision(
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const stamped = await this.documentsService.getUncontrolledRevision(
      id,
      revisionId,
      user!,
    );
    return new StreamableFile(createReadStream(stamped.filePath), {
      type: stamped.mimeType,
      disposition: `attachment; filename="${stamped.filename}"`,
      length: stamped.fileSize,
    });
  }

  @Get(":id/revisions")
  @RequirePermissions("documents.view", "document-requests.view")
  @ApiOperation({ summary: "List revisions for a document" })
  @ApiOkResponse({ description: "Document revisions retrieved successfully." })
  findRevisions(@Param("id") id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.documentsService.findRevisions(id, user!);
  }

  @Put(":id/assignments")
  @RequirePermissions("documents.edit")
  @ApiOperation({ summary: "Replace the users assigned to a document" })
  setAssignments(
    @Param("id") id: string,
    @Body() dto: AssignDocumentUsersDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.setAssignments(id, dto.user_ids, user!);
  }

  @Get("assignments/users/:userId")
  @RequirePermissions("documents.edit")
  @ApiOperation({ summary: "List documents available for assignment to a user" })
  userAssignmentOptions(
    @Param("userId") userId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.findUserAssignmentOptions(userId, user!);
  }

  @Put("assignments/users/:userId")
  @RequirePermissions("documents.edit")
  @ApiOperation({ summary: "Replace all documents assigned to a user" })
  setUserAssignments(
    @Param("userId") userId: string,
    @Body() dto: AssignUserDocumentsDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.setUserAssignments(userId, dto.document_ids, user!);
  }

  @Get(":id/approvers")
  @RequirePermissions("documents.view", "document-requests.view")
  getApproverConfiguration(@Param("id") id: string) {
    return this.documentsService.getApproverConfiguration(id);
  }

  @Put(":id/approvers")
  @RequirePermissions(DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION, "documents.edit")
  setApproverConfiguration(
    @Param("id") id: string,
    @Body() dto: ConfigureDocumentApproversDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.setApproverConfiguration(id, dto, user!);
  }

  @Patch(":id/workflow-steps/:stepId/assignee")
  @RequirePermissions(DOCUMENT_WORKFLOW_CONFIGURATION_PERMISSION)
  @ApiOperation({ summary: "Reassign a pending workflow step with an audit reason" })
  reassignWorkflowStep(
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @Body() dto: ReassignWorkflowStepDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.reassignWorkflowStep(id, stepId, dto, user!);
  }

  @Patch(":id/directory")
  @RequirePermissions("documents.edit", "documents.manage-own")
  @ApiOperation({ summary: "Change the folder or subfolder for a completed Softcopy" })
  @ApiOkResponse({ description: "Document directory changed successfully." })
  changeDirectory(
    @Param("id") id: string,
    @Body() dto: ChangeDocumentDirectoryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.changeDirectory(id, dto, user!);
  }

  @Post(":id/edit-request")
  @RequirePermissions("documents.edit", "documents.manage-own")
  @ApiOperation({ summary: "Submit changes to an approved or completed Hardcopy through the approval workflow" })
  @ApiCreatedResponse({ description: "Hardcopy edit request submitted successfully." })
  requestHardcopyEdit(
    @Param("id") id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.createHardcopyEditRequest(id, dto, user!);
  }

  @Patch(":id")
  @RequirePermissions("documents.edit", "documents.manage-own", "document-requests.edit")
  @ApiOperation({ summary: "Update document" })
  @ApiOkResponse({ description: "Document updated successfully." })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (hasPermission(user!, "documents.edit")) {
      return this.documentsService.update(id, { ...dto, action: undefined }, user);
    }

    if (user!.role.permissions.includes("documents.manage-own"))
      return this.documentsService.updateOwned(id, dto, user!);
    return this.documentsService.updateRequest(id, dto, user!.user_id, user);
  }

  @Post(":id/submit")
  @RequirePermissions("document-requests.submit")
  submit(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.transition(
      id,
      user!.user_id,
      "submit",
      dto.remarks,
      user,
    );
  }

  @Post(":id/approve")
  @RequirePermissions(...DOCUMENT_APPROVAL_PERMISSIONS)
  // Assignment is still checked by transition(); permission and responsibility are separate gates.
  approve(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.transition(
      id,
      user!.user_id,
      "approve",
      dto.remarks,
      user,
    );
  }

  @Post(":id/request-revision")
  // transition() authorizes the exact pending workflow assignee while approval is active.
  requestRevision(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.transition(
      id,
      user!.user_id,
      "request-revision",
      dto.remarks,
      user,
    );
  }

  @Post(":id/reject")
  @RequirePermissions("document-requests.reject")
  // transition() also requires the current Builder step assignment.
  reject(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.transition(
      id,
      user!.user_id,
      "reject",
      dto.remarks,
      user,
    );
  }

  @Post(":id/cancel")
  @RequirePermissions("document-requests.edit")
  cancel(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.transition(id, user!.user_id, "cancel", dto.remarks, user);
  }

  @Post(":id/complete")
  @RequirePermissions("document-requests.complete")
  complete(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.transition(id, user!.user_id, "complete", dto.remarks, user);
  }

  @Post(":id/dispose")
  @RequirePermissions(
    "documents.dispose",
    "document-disposal.dispose",
    "document-disposal.manage",
  )
  @ApiOperation({ summary: "Dispose document" })
  @ApiOkResponse({ description: "Document disposed successfully." })
  dispose(
    @Param("id") id: string,
    @Body() dto: DisposeDocumentDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (!canManageDocuments(user!)) {
      throw new ForbiddenException("Only document managers can dispose documents directly. Submit a disposal request instead.");
    }
    return this.documentsService.dispose(id, dto, user);
  }

  @Post(":id/disposal-request")
  @RequirePermissions("document-disposal.request")
  @ApiOperation({ summary: "Request administrator approval to dispose a document" })
  requestDisposal(
    @Param("id") id: string,
    @Body() dto: DisposeDocumentDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (canManageDocuments(user!)) {
      throw new ForbiddenException("Document managers should use direct disposal.");
    }
    return this.documentsService.requestDisposal(id, dto, user!);
  }

  @Get("disposal-requests/pending")
  @RequirePermissions("document-disposal.review", "document-disposal.manage")
  @ApiOperation({ summary: "List pending disposal requests" })
  listPendingDisposalRequests(@CurrentUser() user?: AuthenticatedUser) {
    this.assertDisposalAdministrator(user!);
    return this.documentsService.listPendingDisposalRequests();
  }

  @Get("disposal-requests/all")
  @RequirePermissions("document-disposal.review", "document-disposal.manage")
  @ApiOperation({ summary: "List all disposal requests for administrator review history" })
  listDisposalRequests(@CurrentUser() user?: AuthenticatedUser) {
    this.assertDisposalAdministrator(user!);
    return this.documentsService.listDisposalRequests();
  }

  @Get("disposal-requests/mine")
  @RequirePermissions("document-disposal.request")
  @ApiOperation({ summary: "List disposal requests submitted by the current user" })
  listMyDisposalRequests(@CurrentUser() user?: AuthenticatedUser) {
    return this.documentsService.listMyDisposalRequests(user!);
  }

  @Post("disposal-requests/:requestId/approve")
  @RequirePermissions("document-disposal.review", "document-disposal.manage")
  approveDisposalRequest(
    @Param("requestId") requestId: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    this.assertDisposalAdministrator(user!);
    return this.documentsService.reviewDisposalRequest(requestId, true, dto.remarks, user!);
  }

  @Post("disposal-requests/:requestId/reject")
  @RequirePermissions("document-disposal.review", "document-disposal.manage")
  rejectDisposalRequest(
    @Param("requestId") requestId: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    this.assertDisposalAdministrator(user!);
    return this.documentsService.reviewDisposalRequest(requestId, false, dto.remarks, user!);
  }

  @Post(":id/restore")
  @RequirePermissions(
    "documents.restore",
    "document-disposal.restore",
    "document-disposal.manage",
  )
  @ApiOperation({ summary: "Restore disposed document" })
  @ApiOkResponse({ description: "Document restored successfully." })
  restore(@Param("id") id: string) {
    return this.documentsService.restore(id);
  }

  @Delete(":id")
  @RequirePermissions("documents.delete", "document-requests.delete", "documents.manage-own")
  @ApiOperation({ summary: "Delete document" })
  @ApiOkResponse({ description: "Document deleted successfully." })
  remove(@Param("id") id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.documentsService.remove(id, user!);
  }

  @Post()
  @RequirePermissions("documents.create", "document-requests.create", "documents.create-direct")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          ensureRevisionUploadsRoot();
          callback(null, revisionUploadsRoot);
        },
        filename: (_request, file, callback) => {
          callback(null, createRevisionFilename(file.originalname));
        },
      }),
      limits: { fileSize: SOFTCOPY_MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: "Create document" })
  @ApiConsumes("multipart/form-data", "application/json")
  @ApiBody({
    schema: {
      type: "object",
      required: ["document_title", "document_type"],
      properties: {
        document_number: { type: "string" },
        document_title: { type: "string" },
        document_type: { type: "string", enum: ["HARDCOPY", "SOFTCOPY"] },
        softcopy_category_id: { type: "string" },
        initial_revision_number: { type: "string", example: "005" },
        action: { type: "string", enum: ["DRAFT", "SUBMIT"] },
        requester_type: {
          type: "string",
          enum: ["CURRENT_USER", "MANUAL_NAME"],
        },
        requested_by_name: { type: "string" },
        asset_id: { type: "string" },
        area_id: { type: "string" },
        specific_id: { type: "string" },
        location_id: { type: "string" },
        sequence_id: { type: "string" },
        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiCreatedResponse({ description: "Document created successfully." })
  create(
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user?: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.createRequest(dto, user!.user_id, file, user);
  }

  private assertDisposalAdministrator(user: AuthenticatedUser) {
    if (!isAdministrativeRole(user.role.role_name)) {
      throw new ForbiddenException("Only administrators can review disposal requests.");
    }
  }

  @Post("assistant/search")
  @RequirePermissions("ai-document-assistant.search", "documents.search")
  @ApiOperation({ summary: "Search authorized documents with the document assistant" })
  assistantSearch(
    @Body() dto: DocumentAssistantQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.assistantSearch(dto, user!);
  }

  @Post(":id/attachments")
  @RequirePermissions("documents.attach-scans", "documents.edit", "documents.manage-own", "documents.delete", "document-requests.delete")
  @UseInterceptors(FilesInterceptor("attachments", 10, {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        ensureAttachmentUploadsRoot();
        callback(null, attachmentUploadsRoot);
      },
      filename: (_request, file, callback) => callback(null, createAttachmentFilename(file.originalname)),
    }),
    limits: { fileSize: SOFTCOPY_MAX_FILE_SIZE_BYTES, files: 10 },
  }))
  @ApiOperation({ summary: "Attach scanned documents or supporting files to a document" })
  @ApiConsumes("multipart/form-data")
  uploadAttachments(
    @Param("id") documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.documentsService.addAttachments(documentId, user, files ?? []);
  }

  @Delete(":id/attachments/:attachmentId")
  @RequirePermissions("documents.attach-scans", "documents.edit", "documents.manage-own")
  deleteAttachment(@Param("id") documentId: string, @Param("attachmentId") attachmentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.removeAttachment(documentId, attachmentId, user);
  }

  @Post("batch-hardcopy")
  @RequirePermissions("batch-import.import", "documents.import")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          ensureBatchImportUploadsRoot();
          callback(null, batchImportUploadsRoot);
        },
        filename: (_request, file, callback) => {
          callback(null, createBatchImportFilename(file.originalname));
        },
      }),
      fileFilter: (_request, file, callback) => {
        const isExcelFile = /\.(xlsx|xls)$/i.test(file.originalname);
        callback(
          isExcelFile
            ? null
            : new Error(
                "Invalid File Format: only .xlsx and .xls files are supported.",
              ),
          isExcelFile,
        );
      },
      limits: { fileSize: BATCH_IMPORT_MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: "Batch import hardcopy documents" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["created_by", "file"],
      properties: {
        created_by: { type: "string", example: "1" },
        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      "Hardcopy documents were processed with per-row success, skip, and error tracking.",
  })
  @ApiBadRequestResponse({
    description:
      "The workbook could not be validated or processed. This includes invalid format, missing columns, missing data, and oversized uploads.",
  })
  batchHardcopyImport(
    @Body() dto: BatchHardcopyUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.batchHardcopyImport(dto, file);
  }

  @Post("batch-softcopy-folder")
  @RequirePermissions("batch-import.import", "documents.import")
  @UseInterceptors(
    FilesInterceptor("files", undefined, {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          ensureRevisionUploadsRoot();
          callback(null, revisionUploadsRoot);
        },
        filename: (_request, file, callback) => {
          callback(null, createRevisionFilename(file.originalname));
        },
      }),
    }),
  )
  @ApiOperation({ summary: "Import a softcopy folder and create its category hierarchy" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["created_by", "relative_paths", "files"],
      properties: {
        created_by: { type: "string" },
        relative_paths: { type: "string", description: "JSON array matching the uploaded file order." },
        files: { type: "array", items: { type: "string", format: "binary" } },
      },
    },
  })
  batchSoftcopyFolderImport(
    @Body() dto: BatchSoftcopyFolderUploadDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.documentsService.batchSoftcopyFolderImport(dto, files);
  }

  @Post("analyze-upload")
  @RequirePermissions("documents.create", "document-requests.create")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: SOFTCOPY_MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: "Read document metadata from an uploaded file" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  analyzeUpload(@UploadedFile() file?: Express.Multer.File) {
    return this.documentsService.analyzeUpload(file);
  }

  @Post(":id/revisions")
  @RequirePermissions("documents.edit", "documents.manage-own", "document-requests.edit")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          ensureRevisionUploadsRoot();
          callback(null, revisionUploadsRoot);
        },
        filename: (_request, file, callback) => {
          callback(null, createRevisionFilename(file.originalname));
        },
      }),
      limits: { fileSize: SOFTCOPY_MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: "Create document revision" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["uploaded_by", "file"],
      properties: {
        revision_number: {
          type: "string",
          example: "000",
          description: "Optional. Generated by the API when omitted.",
        },
        reason_of_revision: { type: "string", nullable: true },
        effective_date: { type: "string", format: "date-time", nullable: true },
        page_number: { type: "string", nullable: true },
        uploaded_by: { type: "string", example: "1" },
        set_as_current: { type: "string", example: "true" },
        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiCreatedResponse({ description: "Revision created successfully." })
  createRevision(
    @Param("id") documentId: string,
    @Body() dto: CreateRevisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.createRevision(documentId, dto, file, user);
  }

  @Post(":id/revisions/:revisionId/correct")
  @RequirePermissions("documents.edit", "documents.manage-own", "document-requests.edit")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          ensureRevisionUploadsRoot();
          callback(null, revisionUploadsRoot);
        },
        filename: (_request, file, callback) => callback(null, createRevisionFilename(file.originalname)),
      }),
      limits: { fileSize: SOFTCOPY_MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: "Upload a controlled replacement with a required correction reason" })
  correctRevision(
    @Param("id") documentId: string,
    @Param("revisionId") revisionId: string,
    @Body() dto: CreateRevisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.createRevision(documentId, { ...dto, superseded_by_revision_id: revisionId }, file, user);
  }

  @Post(":id/revisions/:revisionId/finalize")
  @RequirePermissions("documents.edit", "documents.manage-own", "document-requests.edit")
  @ApiOperation({ summary: "Finalize an approved Softcopy revision as the controlled copy" })
  finalizeRevision(
    @Param("id") documentId: string,
    @Param("revisionId") revisionId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.finalizeRevision(documentId, revisionId, user, body?.reason);
  }
}
