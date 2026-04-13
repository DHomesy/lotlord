-- Migration: 023_documents_extended_types
-- Adds 'property' to related_type and 'photo'/'notice' to category.

-- related_type: add 'property' so docs can be linked to a property directly
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_related_type_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_related_type_check
    CHECK (related_type IN ('lease', 'unit', 'maintenance_request', 'tenant', 'property'));

-- category: add 'photo' and 'notice'
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_category_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_category_check
    CHECK (category IN ('lease', 'id', 'insurance', 'inspection', 'receipt', 'photo', 'notice', 'other'));
