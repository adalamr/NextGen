-- ============================================================
-- Seed 005: IVA App Model Context
--
-- Domain: Invoice Verification & Approval (IVA) — Baxter
-- Requires: a project to exist in the projects table
--
-- What this seed populates (all project-scoped):
--   app_model_api_contracts  — IVA REST API endpoints
--   app_model_pages          — IVA UI screens with key elements
--   app_model_schema_graph   — IVA database tables (entities)
--   app_model_user_roles     — IVA user roles and permissions
--
-- Re-runnable: upserts on (project_id + natural key)
-- ============================================================

DO $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT id INTO v_project_id FROM projects ORDER BY created_at LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'No projects found — skipping IVA App Model seed. Create a project first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding IVA App Model context for project %', v_project_id;

  -- ══════════════════════════════════════════════════════════════════════
  -- API CONTRACTS
  -- ══════════════════════════════════════════════════════════════════════

  -- POST /invoices/upload
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices/upload', 'POST',
    '{"query":[],"path":[]}'::jsonb,
    $s1${
      "requestBody": {
        "content": "multipart/form-data",
        "fields": {
          "document": { "type": "file", "required": true, "allowedTypes": ["application/pdf","application/msword","image/tiff","image/jpeg","image/png"], "maxSize": "20MB" },
          "vendorId": { "type": "string", "required": false, "maxLength": 50 }
        }
      },
      "response201": {
        "invoiceRef": "string — system-generated reference (INV-REF-xxxxx)",
        "status": "Extracting",
        "uploadedAt": "ISO 8601 timestamp",
        "extractionJobId": "string — BullMQ job ID"
      },
      "response400": { "error": "INVALID_FORMAT | FILE_TOO_LARGE | MISSING_DOCUMENT" },
      "response409": { "error": "DUPLICATE_INVOICE", "existingRef": "string", "existingStatus": "string" },
      "response413": { "error": "FILE_TOO_LARGE", "maxAllowed": "20MB" }
    }$s1$::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["AP_CLERK","AP_SUPERVISOR"]}'::jsonb,
    '{"requestsPerMinute": 30}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- GET /invoices
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices', 'GET',
    '{"query": [{"name":"status","type":"enum","values":["Extracting","Pending Review","Pending AP Approval","Pending FD Approval","Approved","Rejected","Posted to ERP"]},{"name":"vendorId","type":"string"},{"name":"dateFrom","type":"date"},{"name":"dateTo","type":"date"},{"name":"page","type":"integer","default":1},{"name":"limit","type":"integer","default":20,"max":100}]}'::jsonb,
    '{"response200": {"items": [{"invoiceRef":"string","invoiceNumber":"string","vendorId":"string","vendorName":"string","invoiceDate":"date","totalAmount":"decimal","currency":"string","status":"string","uploadedAt":"timestamp"}], "total":"integer","page":"integer","limit":"integer"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["AP_CLERK","AP_SUPERVISOR","FINANCE_DIRECTOR"]}'::jsonb,
    '{"requestsPerMinute": 120}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- GET /invoices/:id/extraction
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices/:id/extraction', 'GET',
    '{"path":[{"name":"id","type":"UUID","required":true,"description":"Invoice system ID"}]}'::jsonb,
    '{"response200": {"invoiceRef":"string","fields": [{"fieldName":"string","extractedValue":"string","confidence":"decimal 0-100","status":"ACCEPTED|FLAGGED|MANUALLY_VERIFIED","confidenceIndicator":"GREEN|AMBER|RED"}],"overallConfidence":"decimal","requiresReview":"boolean","flaggedFieldCount":"integer"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["AP_CLERK","AP_SUPERVISOR"]}'::jsonb,
    '{"requestsPerMinute": 60}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- PATCH /invoices/:id/extraction
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices/:id/extraction', 'PATCH',
    '{"path":[{"name":"id","type":"UUID","required":true}]}'::jsonb,
    '{"requestBody": {"fields": [{"fieldName":"string","correctedValue":"string","reason":"string"}]}, "response200": {"updated":"integer","invoice":"object"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["AP_CLERK","AP_SUPERVISOR"]}'::jsonb,
    '{"requestsPerMinute": 30}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- POST /invoices/:id/submit
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices/:id/submit', 'POST',
    '{"path":[{"name":"id","type":"UUID","required":true}]}'::jsonb,
    '{"requestBody": {"notes":"string — optional submission notes"}, "response200": {"invoiceRef":"string","newStatus":"Pending AP Approval | Pending FD Approval","routedTo":"AP_SUPERVISOR | FINANCE_DIRECTOR","reason":"string — routing reason"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["AP_CLERK"]}'::jsonb,
    '{"requestsPerMinute": 20}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- POST /invoices/:id/approve
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices/:id/approve', 'POST',
    '{"path":[{"name":"id","type":"UUID","required":true}]}'::jsonb,
    '{"requestBody": {"notes":"string"}, "response200": {"invoiceRef":"string","newStatus":"Approved","erpPostingQueued":"boolean","approvedBy":"string","approvedAt":"timestamp"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["AP_SUPERVISOR","FINANCE_DIRECTOR"], "constraint": "approver cannot be same user as submitter"}'::jsonb,
    '{"requestsPerMinute": 20}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- POST /invoices/:id/reject
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices/:id/reject', 'POST',
    '{"path":[{"name":"id","type":"UUID","required":true}]}'::jsonb,
    '{"requestBody": {"reason":"string — required rejection reason","notes":"string"}, "response200": {"invoiceRef":"string","newStatus":"Rejected","rejectedBy":"string","rejectedAt":"timestamp"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["AP_SUPERVISOR","FINANCE_DIRECTOR"]}'::jsonb,
    '{"requestsPerMinute": 20}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- GET /vendors
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/vendors', 'GET',
    '{"query":[{"name":"search","type":"string"},{"name":"status","type":"enum","values":["ACTIVE","INACTIVE"]},{"name":"page","type":"integer"},{"name":"limit","type":"integer"}]}'::jsonb,
    '{"response200": {"items": [{"vendorId":"string","vendorName":"string","taxId":"string","paymentTerms":"string","currency":"string","erpCode":"string","status":"ACTIVE|INACTIVE"}], "total":"integer"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT"}'::jsonb,
    '{"requestsPerMinute": 60}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- POST /invoices/:id/erp-post
  INSERT INTO app_model_api_contracts
    (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
  VALUES (
    v_project_id, '/invoices/:id/erp-post', 'POST',
    '{"path":[{"name":"id","type":"UUID","required":true}]}'::jsonb,
    '{"response200": {"invoiceRef":"string","erpSystem":"SAP","erpDocumentNumber":"string","postedAt":"timestamp","newStatus":"Posted to ERP"}, "response503": {"error":"ERP_UNAVAILABLE","retryAfter":"integer seconds"}}'::jsonb,
    '{"required": true, "type": "Bearer JWT", "roles": ["SYSTEM","AP_SUPERVISOR"]}'::jsonb,
    '{"requestsPerMinute": 10}'::jsonb,
    'v1'
  )
  ON CONFLICT DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════
  -- UI PAGES
  -- ══════════════════════════════════════════════════════════════════════

  -- Invoice Upload Page
  INSERT INTO app_model_pages (project_id, name, url_pattern, elements, actions, version)
  VALUES (
    v_project_id,
    'Invoice Upload',
    '/invoices/upload',
    $el1$[
      {"name": "Document Upload Dropzone",  "locator": "[data-testid=upload-dropzone]",   "type": "file-input",   "attributes": {"accept": ".pdf,.docx,.tif,.tiff,.jpg,.jpeg,.png", "maxSize": "20MB"}},
      {"name": "Vendor ID Field",           "locator": "[data-testid=vendor-id-input]",   "type": "text-input",   "attributes": {"maxLength": 50, "autocomplete": "vendor"}},
      {"name": "Vendor Name Display",       "locator": "[data-testid=vendor-name-display]","type": "read-only",   "attributes": {"autoPopulated": true}},
      {"name": "Upload Invoice Button",     "locator": "[data-testid=upload-button]",     "type": "button",       "attributes": {"disabledDuring": "upload"}},
      {"name": "Upload Progress Bar",       "locator": "[data-testid=upload-progress]",   "type": "progress",     "attributes": {"showsPercentage": true}},
      {"name": "Success Banner",            "locator": "[data-testid=success-banner]",    "type": "notification", "attributes": {"type": "success", "showsRef": true}},
      {"name": "Error Banner",              "locator": "[data-testid=error-banner]",      "type": "notification", "attributes": {"type": "error", "showsCode": true}},
      {"name": "Duplicate Warning Dialog",  "locator": "[data-testid=duplicate-dialog]",  "type": "modal",        "attributes": {"showsExistingRef": true, "showsExistingStatus": true}}
    ]$el1$::jsonb,
    $ac1$[
      {"name": "uploadFile",     "trigger": "click Upload Invoice button", "outcome": "POST /invoices/upload"},
      {"name": "selectFile",     "trigger": "click Browse or drop file",   "outcome": "file selected and validated client-side"},
      {"name": "lookupVendor",   "trigger": "blur Vendor ID field",        "outcome": "GET /vendors/:id — vendor name auto-populated"},
      {"name": "viewDashboard",  "trigger": "click View Dashboard link",   "outcome": "navigate to /invoices/review"}
    ]$ac1$::jsonb,
    'v1'
  )
  ON CONFLICT (project_id, name) DO UPDATE SET
    url_pattern = EXCLUDED.url_pattern,
    elements    = EXCLUDED.elements,
    actions     = EXCLUDED.actions,
    updated_at  = NOW();

  -- Invoice Review Dashboard
  INSERT INTO app_model_pages (project_id, name, url_pattern, elements, actions, version)
  VALUES (
    v_project_id,
    'Invoice Review Dashboard',
    '/invoices/review',
    $el2$[
      {"name": "Invoice List Table",       "locator": "[data-testid=invoice-table]",        "type": "table",         "attributes": {"columns": ["Ref","Vendor","Invoice#","Date","Amount","Status","Actions"]}},
      {"name": "Status Filter Dropdown",   "locator": "[data-testid=status-filter]",         "type": "select",        "attributes": {"options": ["All","Extracting","Pending Review","Pending Approval","Approved","Rejected","Posted"]}},
      {"name": "Date Range Picker",        "locator": "[data-testid=date-range-picker]",     "type": "date-range",    "attributes": {}},
      {"name": "Search Field",             "locator": "[data-testid=search-input]",          "type": "text-input",    "attributes": {"placeholder": "Search by invoice# or vendor"}},
      {"name": "Invoice Row Action Menu",  "locator": "[data-testid=row-action-menu]",       "type": "dropdown-menu", "attributes": {"items": ["View","Review Extraction","Submit","Approve","Reject"]}},
      {"name": "Pagination Control",       "locator": "[data-testid=pagination]",            "type": "pagination",    "attributes": {"pageSize": 20}},
      {"name": "Export CSV Button",        "locator": "[data-testid=export-csv]",            "type": "button",        "attributes": {}}
    ]$el2$::jsonb,
    $ac2$[
      {"name": "filterByStatus",    "trigger": "select status from Status Filter",  "outcome": "GET /invoices?status={value}"},
      {"name": "searchInvoices",    "trigger": "type in Search Field",              "outcome": "GET /invoices?search={value} (debounced 300ms)"},
      {"name": "viewExtraction",    "trigger": "click Review Extraction in action menu", "outcome": "navigate to /invoices/{id}/extraction"},
      {"name": "submitForApproval", "trigger": "click Submit in action menu",       "outcome": "POST /invoices/{id}/submit"},
      {"name": "exportCSV",         "trigger": "click Export CSV button",           "outcome": "GET /invoices/export?format=csv"}
    ]$ac2$::jsonb,
    'v1'
  )
  ON CONFLICT (project_id, name) DO UPDATE SET
    url_pattern = EXCLUDED.url_pattern,
    elements    = EXCLUDED.elements,
    actions     = EXCLUDED.actions,
    updated_at  = NOW();

  -- Extraction Review Page
  INSERT INTO app_model_pages (project_id, name, url_pattern, elements, actions, version)
  VALUES (
    v_project_id,
    'Extraction Review',
    '/invoices/:id/extraction',
    $el3$[
      {"name": "Document Viewer",            "locator": "[data-testid=document-viewer]",      "type": "pdf-viewer",   "attributes": {"highlightsExtractedFields": true}},
      {"name": "Extracted Fields Panel",     "locator": "[data-testid=extracted-fields]",     "type": "form",         "attributes": {}},
      {"name": "Confidence Badge",           "locator": "[data-testid=confidence-badge]",     "type": "badge",        "attributes": {"colors": {"GREEN": ">=85", "AMBER": "70-84", "RED": "<70"}}},
      {"name": "Manual Override Input",      "locator": "[data-testid=field-override-input]", "type": "text-input",   "attributes": {"showsWhen": "field is FLAGGED"}},
      {"name": "Submit for Approval Button", "locator": "[data-testid=submit-approval-btn]",  "type": "button",       "attributes": {"disabledWhen": "flaggedFieldCount > 0"}},
      {"name": "Flagged Fields Counter",     "locator": "[data-testid=flagged-count]",        "type": "counter",      "attributes": {"showsZeroAs": "All fields verified"}},
      {"name": "Overall Confidence Score",   "locator": "[data-testid=overall-confidence]",   "type": "metric",       "attributes": {}}
    ]$el3$::jsonb,
    $ac3$[
      {"name": "overrideField",     "trigger": "edit Manual Override Input",    "outcome": "PATCH /invoices/{id}/extraction (single field)"},
      {"name": "submitApproval",    "trigger": "click Submit for Approval",     "outcome": "POST /invoices/{id}/submit"},
      {"name": "highlightInDoc",    "trigger": "click field in Extracted Fields Panel", "outcome": "document viewer highlights corresponding region"}
    ]$ac3$::jsonb,
    'v1'
  )
  ON CONFLICT (project_id, name) DO UPDATE SET
    url_pattern = EXCLUDED.url_pattern,
    elements    = EXCLUDED.elements,
    actions     = EXCLUDED.actions,
    updated_at  = NOW();

  -- Approval Queue Page
  INSERT INTO app_model_pages (project_id, name, url_pattern, elements, actions, version)
  VALUES (
    v_project_id,
    'Approval Queue',
    '/invoices/approval-queue',
    $el4$[
      {"name": "Approval Queue Table",     "locator": "[data-testid=approval-queue-table]", "type": "table",   "attributes": {"columns": ["Ref","Vendor","Invoice#","Date","Amount","Submitted By","Submitted At","Actions"]}},
      {"name": "Approve Button",           "locator": "[data-testid=approve-btn]",          "type": "button",  "attributes": {"requiresConfirmation": true}},
      {"name": "Reject Button",            "locator": "[data-testid=reject-btn]",           "type": "button",  "attributes": {"requiresReason": true}},
      {"name": "Rejection Reason Modal",   "locator": "[data-testid=rejection-reason-modal]","type": "modal",  "attributes": {"reasonRequired": true, "maxLength": 500}},
      {"name": "Invoice Detail Link",      "locator": "[data-testid=invoice-detail-link]",  "type": "link",    "attributes": {}},
      {"name": "Bulk Approve Checkbox",    "locator": "[data-testid=bulk-select]",          "type": "checkbox","attributes": {"maxBulk": 10}}
    ]$el4$::jsonb,
    $ac4$[
      {"name": "approveSingle",  "trigger": "click Approve button",            "outcome": "POST /invoices/{id}/approve"},
      {"name": "rejectSingle",   "trigger": "click Reject button + enter reason", "outcome": "POST /invoices/{id}/reject"},
      {"name": "bulkApprove",    "trigger": "select multiple + click Bulk Approve", "outcome": "POST /invoices/bulk-approve"},
      {"name": "viewDetail",     "trigger": "click Invoice Detail Link",       "outcome": "navigate to /invoices/{id}/extraction"}
    ]$ac4$::jsonb,
    'v1'
  )
  ON CONFLICT (project_id, name) DO UPDATE SET
    url_pattern = EXCLUDED.url_pattern,
    elements    = EXCLUDED.elements,
    actions     = EXCLUDED.actions,
    updated_at  = NOW();

  -- Vendor Management Page
  INSERT INTO app_model_pages (project_id, name, url_pattern, elements, actions, version)
  VALUES (
    v_project_id,
    'Vendor Management',
    '/vendors',
    $el5$[
      {"name": "Vendor List Table",    "locator": "[data-testid=vendor-table]",    "type": "table",      "attributes": {"columns": ["Vendor ID","Name","Tax ID","Payment Terms","Currency","ERP Code","Status"]}},
      {"name": "Add Vendor Button",    "locator": "[data-testid=add-vendor-btn]",  "type": "button",     "attributes": {}},
      {"name": "Vendor Search Input",  "locator": "[data-testid=vendor-search]",   "type": "text-input", "attributes": {}},
      {"name": "Status Toggle",        "locator": "[data-testid=vendor-status-toggle]", "type": "toggle","attributes": {"options": ["ACTIVE","INACTIVE"]}}
    ]$el5$::jsonb,
    '[]'::jsonb,
    'v1'
  )
  ON CONFLICT (project_id, name) DO UPDATE SET
    url_pattern = EXCLUDED.url_pattern,
    elements    = EXCLUDED.elements,
    updated_at  = NOW();

  -- ══════════════════════════════════════════════════════════════════════
  -- DATABASE SCHEMA GRAPH (key IVA entities)
  -- ══════════════════════════════════════════════════════════════════════

  -- invoices table
  INSERT INTO app_model_schema_graph (project_id, table_name, columns, relations, constraints, indexes)
  VALUES (
    v_project_id, 'invoices',
    $c1$[
      {"name":"id",             "type":"UUID",          "nullable":false, "pk":true},
      {"name":"invoice_ref",    "type":"VARCHAR(50)",   "nullable":false, "description":"System-generated reference (INV-REF-xxxxx)"},
      {"name":"invoice_number", "type":"VARCHAR(100)",  "nullable":false, "description":"Invoice number as printed on document"},
      {"name":"invoice_date",   "type":"DATE",          "nullable":false},
      {"name":"vendor_id",      "type":"UUID",          "nullable":false, "fk":"vendors.id"},
      {"name":"total_amount",   "type":"DECIMAL(15,2)", "nullable":false},
      {"name":"currency",       "type":"CHAR(3)",       "nullable":false, "default":"GBP"},
      {"name":"status",         "type":"VARCHAR(50)",   "nullable":false, "enum":["Extracting","Pending Review","Pending AP Approval","Pending FD Approval","Approved","Rejected","Posted to ERP"]},
      {"name":"uploaded_by",    "type":"UUID",          "nullable":false, "fk":"users.id"},
      {"name":"uploaded_at",    "type":"TIMESTAMPTZ",   "nullable":false, "default":"NOW()"},
      {"name":"submitted_at",   "type":"TIMESTAMPTZ",   "nullable":true},
      {"name":"approved_by",    "type":"UUID",          "nullable":true,  "fk":"users.id"},
      {"name":"approved_at",    "type":"TIMESTAMPTZ",   "nullable":true},
      {"name":"erp_document_number", "type":"VARCHAR(50)", "nullable":true, "description":"SAP document number after posting"},
      {"name":"erp_posted_at",  "type":"TIMESTAMPTZ",   "nullable":true}
    ]$c1$::jsonb,
    '[{"from":"invoices.vendor_id","to":"vendors.id","type":"MANY_TO_ONE"},{"from":"invoices.uploaded_by","to":"users.id","type":"MANY_TO_ONE"},{"from":"invoices.approved_by","to":"users.id","type":"MANY_TO_ONE"}]'::jsonb,
    '[{"name":"uq_invoice_number_vendor_date","columns":["invoice_number","vendor_id","invoice_date"],"type":"UNIQUE","note":"Duplicate detection key"},{"name":"chk_positive_amount","expression":"total_amount > 0","type":"CHECK"}]'::jsonb,
    '[{"name":"idx_invoices_status","columns":["status"]},{"name":"idx_invoices_vendor","columns":["vendor_id"]},{"name":"idx_invoices_uploaded_at","columns":["uploaded_at DESC"]}]'::jsonb
  )
  ON CONFLICT (project_id, table_name) DO UPDATE SET
    columns     = EXCLUDED.columns,
    relations   = EXCLUDED.relations,
    constraints = EXCLUDED.constraints,
    indexes     = EXCLUDED.indexes;

  -- vendors table
  INSERT INTO app_model_schema_graph (project_id, table_name, columns, relations, constraints, indexes)
  VALUES (
    v_project_id, 'vendors',
    '[{"name":"id","type":"UUID","nullable":false,"pk":true},{"name":"vendor_id","type":"VARCHAR(50)","nullable":false,"description":"Business vendor code (e.g., VND-00142)"},{"name":"vendor_name","type":"VARCHAR(255)","nullable":false},{"name":"tax_id","type":"VARCHAR(50)","nullable":true},{"name":"payment_terms","type":"VARCHAR(50)","nullable":true,"description":"e.g., NET30"},{"name":"currency","type":"CHAR(3)","nullable":false,"default":"GBP"},{"name":"erp_code","type":"VARCHAR(50)","nullable":true,"description":"Code in SAP vendor master"},{"name":"status","type":"VARCHAR(20)","nullable":false,"default":"ACTIVE","enum":["ACTIVE","INACTIVE"]},{"name":"created_at","type":"TIMESTAMPTZ","nullable":false}]'::jsonb,
    '[]'::jsonb,
    '[{"name":"uq_vendor_id","columns":["vendor_id"],"type":"UNIQUE"}]'::jsonb,
    '[{"name":"idx_vendors_name","columns":["vendor_name"]},{"name":"idx_vendors_erp","columns":["erp_code"]}]'::jsonb
  )
  ON CONFLICT (project_id, table_name) DO UPDATE SET
    columns     = EXCLUDED.columns,
    constraints = EXCLUDED.constraints,
    indexes     = EXCLUDED.indexes;

  -- invoice_extraction_fields table
  INSERT INTO app_model_schema_graph (project_id, table_name, columns, relations, constraints, indexes)
  VALUES (
    v_project_id, 'invoice_extraction_fields',
    '[{"name":"id","type":"UUID","nullable":false,"pk":true},{"name":"invoice_id","type":"UUID","nullable":false,"fk":"invoices.id"},{"name":"field_name","type":"VARCHAR(100)","nullable":false,"description":"e.g., vendor_name, invoice_number, total_amount, tax_amount"},{"name":"extracted_value","type":"TEXT","nullable":true},{"name":"corrected_value","type":"TEXT","nullable":true,"description":"Set if AP Clerk manually overrides"},{"name":"confidence","type":"DECIMAL(5,2)","nullable":true,"description":"0-100 from OCR engine"},{"name":"status","type":"VARCHAR(30)","nullable":false,"enum":["ACCEPTED","FLAGGED","MANUALLY_VERIFIED"]},{"name":"corrected_by","type":"UUID","nullable":true,"fk":"users.id"},{"name":"corrected_at","type":"TIMESTAMPTZ","nullable":true}]'::jsonb,
    '[{"from":"invoice_extraction_fields.invoice_id","to":"invoices.id","type":"MANY_TO_ONE"},{"from":"invoice_extraction_fields.corrected_by","to":"users.id","type":"MANY_TO_ONE"}]'::jsonb,
    '[{"name":"uq_invoice_field","columns":["invoice_id","field_name"],"type":"UNIQUE"}]'::jsonb,
    '[{"name":"idx_extraction_invoice","columns":["invoice_id"]},{"name":"idx_extraction_status","columns":["invoice_id","status"]}]'::jsonb
  )
  ON CONFLICT (project_id, table_name) DO UPDATE SET
    columns   = EXCLUDED.columns,
    relations = EXCLUDED.relations;

  -- approval_audit_log table
  INSERT INTO app_model_schema_graph (project_id, table_name, columns, relations, constraints, indexes)
  VALUES (
    v_project_id, 'approval_audit_log',
    '[{"name":"id","type":"UUID","nullable":false,"pk":true},{"name":"invoice_id","type":"UUID","nullable":false,"fk":"invoices.id"},{"name":"action","type":"VARCHAR(50)","nullable":false,"enum":["SUBMITTED","APPROVED","REJECTED","ESCALATED","POSTED_TO_ERP"]},{"name":"from_status","type":"VARCHAR(50)","nullable":true},{"name":"to_status","type":"VARCHAR(50)","nullable":false},{"name":"performed_by","type":"UUID","nullable":false,"fk":"users.id"},{"name":"performed_at","type":"TIMESTAMPTZ","nullable":false,"default":"NOW()"},{"name":"notes","type":"TEXT","nullable":true},{"name":"rejection_reason","type":"TEXT","nullable":true}]'::jsonb,
    '[{"from":"approval_audit_log.invoice_id","to":"invoices.id","type":"MANY_TO_ONE"},{"from":"approval_audit_log.performed_by","to":"users.id","type":"MANY_TO_ONE"}]'::jsonb,
    '[]'::jsonb,
    '[{"name":"idx_audit_invoice","columns":["invoice_id","performed_at DESC"]}]'::jsonb
  )
  ON CONFLICT (project_id, table_name) DO UPDATE SET
    columns   = EXCLUDED.columns,
    relations = EXCLUDED.relations;

  -- purchase_orders table
  INSERT INTO app_model_schema_graph (project_id, table_name, columns, relations, constraints, indexes)
  VALUES (
    v_project_id, 'purchase_orders',
    '[{"name":"id","type":"UUID","nullable":false,"pk":true},{"name":"po_number","type":"VARCHAR(50)","nullable":false},{"name":"vendor_id","type":"UUID","nullable":false,"fk":"vendors.id"},{"name":"po_amount","type":"DECIMAL(15,2)","nullable":false},{"name":"currency","type":"CHAR(3)","nullable":false},{"name":"matched_invoice_id","type":"UUID","nullable":true,"fk":"invoices.id"},{"name":"tolerance_pct","type":"DECIMAL(5,2)","nullable":false,"default":"5.00","description":"PO reconciliation tolerance (default 5%)"},{"name":"status","type":"VARCHAR(30)","nullable":false,"enum":["OPEN","MATCHED","PARTIALLY_MATCHED","CLOSED"]}]'::jsonb,
    '[{"from":"purchase_orders.vendor_id","to":"vendors.id","type":"MANY_TO_ONE"},{"from":"purchase_orders.matched_invoice_id","to":"invoices.id","type":"ONE_TO_ONE"}]'::jsonb,
    '[{"name":"uq_po_number","columns":["po_number"],"type":"UNIQUE"}]'::jsonb,
    '[{"name":"idx_po_vendor","columns":["vendor_id"]},{"name":"idx_po_status","columns":["status"]}]'::jsonb
  )
  ON CONFLICT (project_id, table_name) DO UPDATE SET
    columns   = EXCLUDED.columns,
    relations = EXCLUDED.relations;

  -- ══════════════════════════════════════════════════════════════════════
  -- USER ROLES
  -- ══════════════════════════════════════════════════════════════════════

  INSERT INTO app_model_user_roles (project_id, role_name, permissions, description, version)
  VALUES
  (
    v_project_id, 'AP_CLERK',
    '["invoice:upload","invoice:view","invoice:review-extraction","invoice:submit","vendor:view"]'::jsonb,
    'Accounts Payable Clerk — uploads invoices, reviews AI extraction results, and submits for approval. Cannot approve their own submissions.',
    'v1'
  ),
  (
    v_project_id, 'AP_SUPERVISOR',
    '["invoice:upload","invoice:view","invoice:review-extraction","invoice:submit","invoice:approve","invoice:reject","vendor:view","vendor:manage","report:view"]'::jsonb,
    'Accounts Payable Supervisor — all AP Clerk permissions plus approve/reject invoices up to 50,000 GBP. Cannot approve invoices they submitted.',
    'v1'
  ),
  (
    v_project_id, 'FINANCE_DIRECTOR',
    '["invoice:view","invoice:approve","invoice:reject","invoice:override","vendor:view","report:view","report:export"]'::jsonb,
    'Finance Director — approves high-value invoices exceeding 50,000 GBP. Has view access to all invoices and financial reports.',
    'v1'
  ),
  (
    v_project_id, 'SYSTEM_ADMIN',
    '["*"]'::jsonb,
    'System Administrator — full access to all functions including user management, vendor master, configuration, and audit logs.',
    'v1'
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'IVA App Model seed complete for project %: 9 API contracts, 5 pages, 5 DB tables, 4 user roles', v_project_id;
END $$;
