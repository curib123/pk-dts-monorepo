import {
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { diskStorage } from "multer";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../../common/auth/require-permissions.decorator";
import {
  createRevisionFilename,
  ensureRevisionUploadsRoot,
  revisionUploadsRoot,
} from "../../../config/upload-paths";
import { DocumentRequestReviewFileService } from "./document-request-review-file.service";
import { RequestReviewFileDto } from "./dto/request-review-file.dto";
import { WorkflowActionDto } from "./dto/workflow-action.dto";

const SOFTCOPY_MAX_FILE_SIZE_BYTES =
  Number(process.env.SOFTCOPY_MAX_FILE_SIZE_BYTES) || 100 * 1024 * 1024;

@ApiTags("Documents")
@Controller({ path: "documents", version: "1" })
export class DocumentRequestReviewFileController {
  constructor(
    private readonly reviewFiles: DocumentRequestReviewFileService,
  ) {}

  @Post(":id/request-review-file")
  @RequirePermissions(
    "document-requests.edit",
    "documents.manage-own",
    "documents.edit",
  )
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
  @ApiOperation({
    summary:
      "Attach the new or revised Softcopy file to a Document Control Request before approval",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        revision_number: { type: "string" },
        reason_of_revision: { type: "string" },
        effective_date: { type: "string", format: "date-time" },
        page_number: { type: "string" },
        series_number: { type: "string" },
        revision_level_from: { type: "string" },
        revision_level_to: { type: "string" },
        previous_effective_date: { type: "string", format: "date-time" },
        new_effective_date: { type: "string", format: "date-time" },
        file: { type: "string", format: "binary" },
      },
    },
  })
  attachReviewFile(
    @Param("id") id: string,
    @Body() dto: RequestReviewFileDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewFiles.attachReviewFile(id, dto, file, user);
  }

  @Post(":id/submit-review")
  @RequirePermissions("document-requests.submit")
  @ApiOperation({
    summary:
      "Submit a Document Control Request after verifying its Softcopy review file",
  })
  submitReview(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewFiles.submitReview(id, dto.remarks, user);
  }

  @Post(":id/approve-review")
  @ApiOperation({
    summary:
      "Approve a workflow step and promote the reviewed Softcopy on final approval",
  })
  approveReview(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewFiles.approveReview(id, dto.remarks, user);
  }

  @Post(":id/complete-review")
  @RequirePermissions("document-requests.complete")
  @ApiOperation({
    summary:
      "Complete and release an approved request without requiring a post-approval upload",
  })
  completeReview(
    @Param("id") id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewFiles.completeReview(id, dto.remarks, user);
  }
}
