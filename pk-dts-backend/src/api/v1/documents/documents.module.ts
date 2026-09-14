import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { PublicDocumentsController } from "./public-documents.controller";
import { ElectronicDocumentStampService } from "./electronic-document-stamp.service";
import { RequestTimeDocumentsService } from "./request-time-documents.service";

@Module({
  controllers: [DocumentsController, PublicDocumentsController],
  providers: [
    ElectronicDocumentStampService,
    RequestTimeDocumentsService,
    { provide: DocumentsService, useExisting: RequestTimeDocumentsService },
  ],
})
export class DocumentsModule {}
