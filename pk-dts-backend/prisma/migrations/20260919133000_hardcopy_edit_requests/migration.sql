ALTER TABLE `documents`
  ADD COLUMN `source_document_id` BIGINT NULL,
  ADD COLUMN `source_document_updated_at` DATETIME(3) NULL;

CREATE INDEX `documents_source_document_id_status_idx`
  ON `documents`(`source_document_id`, `status`);

ALTER TABLE `documents`
  ADD CONSTRAINT `documents_source_document_id_fkey`
  FOREIGN KEY (`source_document_id`) REFERENCES `documents`(`document_id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
