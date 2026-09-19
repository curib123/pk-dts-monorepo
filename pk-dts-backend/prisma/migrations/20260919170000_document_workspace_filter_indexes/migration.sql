-- Index the fields used by the server-side document workspace filters.
CREATE INDEX IF NOT EXISTS "documents_document_type_status_created_at_idx"
ON "documents"("document_type", "status", "created_at");

CREATE INDEX IF NOT EXISTS "documents_created_by_status_created_at_idx"
ON "documents"("created_by", "status", "created_at");

CREATE INDEX IF NOT EXISTS "hardcopy_documents_area_id_document_id_idx"
ON "hardcopy_documents"("area_id", "document_id");

CREATE INDEX IF NOT EXISTS "hardcopy_documents_location_id_document_id_idx"
ON "hardcopy_documents"("location_id", "document_id");

CREATE INDEX IF NOT EXISTS "hardcopy_documents_specific_id_document_id_idx"
ON "hardcopy_documents"("specific_id", "document_id");

CREATE INDEX IF NOT EXISTS "hardcopy_documents_asset_id_document_id_idx"
ON "hardcopy_documents"("asset_id", "document_id");

CREATE INDEX IF NOT EXISTS "hardcopy_documents_sequence_id_document_id_idx"
ON "hardcopy_documents"("sequence_id", "document_id");

CREATE INDEX IF NOT EXISTS "softcopy_documents_softcopy_category_id_document_id_idx"
ON "softcopy_documents"("softcopy_category_id", "document_id");
