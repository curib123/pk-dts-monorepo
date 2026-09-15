import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { PublicDocumentsController } from "./public-documents.controller";
import { ElectronicDocumentStampService } from "./electronic-document-stamp.service";
import { DocumentRequestReviewFileController } from "./document-request-review-file.controller";
import { DocumentRequestReviewFileService } from "./document-request-review-file.service";

@Module({
  controllers: [
    DocumentsController,
    DocumentRequestReviewFileController,
    PublicDocumentsController,
  ],
  providers: [
    DocumentsService,
    ElectronicDocumentStampService,
    DocumentRequestReviewFileService,
  ],
})
export class DocumentsModule {}
