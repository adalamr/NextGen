-- ============================================================
-- Seed 004: IVA-specific Input / Output Templates & Sample I/O Pairs
--
-- Source schemas: sampleinputtemplate.json + sampleoutputtemplate.json
-- Domain: Invoice Verification & Approval (IVA) — Baxter
--
-- What this seed does:
--   1. Deactivates the generic login/CRUD templates from seed 002
--   2. Inserts IVA-specific Input Template (1A) — full field schema
--   3. Inserts IVA-specific Output Template (1B) — test case schema + example
--   4. Inserts 4 IVA Sample I/O Pairs (1D) — few-shot LLM examples
--
-- Re-runnable: uses ON CONFLICT (org_id, name) DO UPDATE
-- ============================================================

DO $$
DECLARE
  v_org_id  UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_org_id  FROM organizations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user_id FROM users         ORDER BY created_at LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organizations found — skipping IVA template seed. Register a user first.';
    RETURN;
  END IF;

  -- ── 1. Deactivate generic templates (replaced by IVA-specific versions) ──────
  UPDATE input_templates
    SET is_active = FALSE
    WHERE org_id = v_org_id AND name = 'Standard Requirement Template';

  UPDATE output_templates
    SET is_active = FALSE
    WHERE org_id = v_org_id AND name = 'Standard Test Case Template';

  -- ══════════════════════════════════════════════════════════════════════
  -- 2. IVA INPUT TEMPLATE (1A)
  --    JSON Schema encoding of sampleinputtemplate.json field definitions
  -- ══════════════════════════════════════════════════════════════════════
  INSERT INTO input_templates (org_id, name, description, schema, created_by)
  VALUES (
    v_org_id,
    'IVA Requirement Input Template v1.0',
    'Structured requirement input schema for IVA (Invoice Verification & Approval). Covers invoice processing, ERP integration, approval workflows, extraction validation, and duplicate detection. Based on sampleinputtemplate.json v1.0.',
    $inp${
      "$schema": "http://json-schema.org/draft-07/schema#",
      "version": "1.0",
      "type": "object",
      "required": ["title", "description", "appType"],
      "properties": {
        "requirementId": {
          "type": "string",
          "description": "Unique requirement identifier (e.g., REQ-2847)",
          "example": "REQ-001"
        },
        "title": {
          "type": "string",
          "required": true,
          "maxLength": 200,
          "description": "Short descriptive title of the feature/requirement",
          "example": "Invoice Document Upload"
        },
        "description": {
          "type": "string",
          "required": true,
          "description": "Detailed functional requirement text. Include: what the user does, what the system should do, expected outcome, constraints/limits.",
          "example": "As an AP Clerk, I want to upload invoice documents so that the system can extract invoice details for processing."
        },
        "appType": {
          "type": "string",
          "required": true,
          "enum": ["web", "api", "mobile", "desktop", "hybrid", "database"],
          "default": "web",
          "description": "Type of application being tested"
        },
        "module": {
          "type": "string",
          "description": "Module/area of the application",
          "example": "Invoice Processing"
        },
        "userRoles": {
          "type": "array",
          "items": { "type": "string" },
          "description": "User roles involved in this requirement",
          "example": ["AP Clerk", "AP Supervisor", "Finance Manager"]
        },
        "inputFields": {
          "type": "array",
          "description": "Fields the user interacts with — critical for accurate BVA and EP test generation",
          "items": {
            "type": "object",
            "required": ["fieldName", "dataType"],
            "properties": {
              "fieldName":     { "type": "string" },
              "dataType":      { "type": "string", "enum": ["string","number","decimal","date","datetime","boolean","enum","email","phone","url","file"] },
              "constraints":   { "type": "object", "properties": { "required": {"type":"boolean"}, "minValue": {"type":"number"}, "maxValue": {"type":"number"}, "minLength": {"type":"number"}, "maxLength": {"type":"number"}, "pattern": {"type":"string"}, "allowedValues": {"type":"array"} } },
              "validValues":   { "type": "string", "description": "Description of what constitutes valid input" },
              "invalidValues": { "type": "string", "description": "Known invalid inputs to test against" }
            }
          }
        },
        "businessRules": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Business rules that constrain the feature behavior",
          "example": ["Invoice number must be unique per vendor", "Invoices > 50,000 GBP require Finance Director approval"]
        },
        "stateTransitions": {
          "type": "array",
          "description": "Workflow state transitions if applicable",
          "items": {
            "type": "object",
            "properties": {
              "from":    { "type": "string" },
              "to":      { "type": "string" },
              "trigger": { "type": "string" },
              "guard":   { "type": "string" }
            }
          },
          "example": [
            { "from": "Pending Review", "to": "Approved",  "trigger": "AP Supervisor approves" },
            { "from": "Pending Review", "to": "Rejected",  "trigger": "AP Supervisor rejects" },
            { "from": "Approved",       "to": "Posted",    "trigger": "ERP sync succeeds" }
          ]
        },
        "integrations": {
          "type": "array",
          "items": { "type": "string" },
          "description": "External systems, APIs, or services involved",
          "example": ["SAP ERP", "Kofax Total Agility OCR", "Azure Blob Storage", "Notification Service"]
        },
        "securityConstraints": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Security requirements for this feature",
          "example": ["Authentication required", "Role-based access: AP Clerk cannot approve own submissions", "Audit trail for all actions"]
        },
        "performanceExpectations": {
          "type": "string",
          "description": "Performance SLAs or expectations",
          "example": "Document upload must complete within 5 seconds for files up to 20MB"
        },
        "acceptanceCriteria": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Explicit acceptance criteria in Given/When/Then format",
          "example": [
            "GIVEN an AP Clerk uploads a valid PDF invoice WHEN the file is under 20MB THEN extraction starts within 5 seconds",
            "GIVEN a duplicate invoice number is uploaded WHEN the same vendor is already in the system THEN the upload is blocked with error REF-DUP-001"
          ]
        }
      }
    }$inp$::jsonb,
    v_user_id
  )
  ON CONFLICT (org_id, name)
  DO UPDATE SET
    schema     = EXCLUDED.schema,
    description = EXCLUDED.description,
    is_active  = TRUE,
    updated_at = NOW();

  -- ══════════════════════════════════════════════════════════════════════
  -- 3. IVA OUTPUT TEMPLATE (1B)
  --    JSON Schema encoding of sampleoutputtemplate.json testCaseSchema
  -- ══════════════════════════════════════════════════════════════════════
  INSERT INTO output_templates (org_id, name, description, schema, example, created_by)
  VALUES (
    v_org_id,
    'IVA Test Case Output Template v1.0',
    'Mandatory structure for all IVA-generated test cases. Enforces technique labelling, specific expected results, real field names, test data, riskScore, confidence, and rationale. Based on sampleoutputtemplate.json v1.0.',
    $out${
      "$schema": "http://json-schema.org/draft-07/schema#",
      "version": "1.0",
      "type": "object",
      "required": ["id","technique","title","description","preconditions","steps","priority","riskScore","confidence","rationale"],
      "properties": {
        "id":          { "type": "string", "pattern": "TC-[0-9]+", "description": "Unique test case ID within the generation batch" },
        "technique":   { "type": "string", "enum": ["happy_path","equivalence_partitioning","boundary_value_analysis","negative_validation","state_transition","decision_table","security","performance","edge_case"], "description": "Test design technique used" },
        "title":       { "type": "string", "maxLength": 150, "description": "Action-oriented, specific title. BAD: Test upload. GOOD: Verify upload fails when file exceeds 20MB limit" },
        "description": { "type": "string", "description": "What this test verifies and WHY it matters" },
        "preconditions": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1,
          "description": "Conditions that must be true before the test starts. Must be specific and reproducible."
        },
        "steps": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["stepNo","action","expected"],
            "properties": {
              "stepNo":   { "type": "integer" },
              "action":   { "type": "string", "description": "Specific action. Use real field names. BAD: Enter data. GOOD: Enter 500.00 in the Transfer Amount field" },
              "testData": { "type": "string", "description": "Exact test data. BAD: valid amount. GOOD: 500.00" },
              "expected": { "type": "string", "description": "Specific expected result. BANNED: should work correctly, no errors, as expected" }
            }
          }
        },
        "priority":   { "type": "string", "enum": ["critical","high","medium","low"] },
        "riskScore":  { "type": "string", "enum": ["high","medium","low"], "description": "Based on: financial impact, security exposure, user-facing visibility, defect frequency" },
        "confidence": { "type": "string", "enum": ["high","medium","low"], "description": "high = directly stated in requirement; medium = inferred; low = assumed" },
        "rationale":  { "type": "string", "description": "1-2 sentence explanation of WHY this test exists and what risk it mitigates" },
        "traceability": { "type": "string", "description": "Links to requirement ID and/or App Model element" }
      },
      "qualityRules": {
        "minTechniques": 4,
        "minCasesPerApplicableTechnique": 1,
        "noVagueExpectedResults": true,
        "bannedPhrases": ["should work correctly","system behaves as expected","no errors occur","works fine","as expected","proper behavior"],
        "mustReferenceRealFieldNames": true,
        "mustIncludeTestData": true,
        "coverageSummaryRequired": true
      }
    }$out$::jsonb,
    $ex0${
      "id": "TC-001",
      "technique": "happy_path",
      "title": "Verify successful PDF invoice upload by AP Clerk",
      "description": "Validates that an authenticated AP Clerk can upload a valid PDF invoice and the system starts extraction automatically",
      "preconditions": [
        "User is logged in as AP Clerk role",
        "User is on the Invoice Upload page (/invoices/upload)",
        "Valid PDF invoice file available: invoice_INV-2024-001.pdf (2.4 MB)"
      ],
      "steps": [
        { "stepNo": 1, "action": "Click Browse or drag file to the Document Upload area", "testData": "invoice_INV-2024-001.pdf (2.4 MB, PDF)", "expected": "File name invoice_INV-2024-001.pdf appears in the upload area with a PDF icon" },
        { "stepNo": 2, "action": "Enter vendor code in the Vendor ID field", "testData": "VND-00142", "expected": "Vendor name Baxter Healthcare Ltd is auto-populated in the Vendor Name field" },
        { "stepNo": 3, "action": "Click Upload Invoice button", "testData": "", "expected": "Progress bar appears; upload status changes to Processing" },
        { "stepNo": 4, "action": "Wait for upload confirmation", "testData": "", "expected": "Success banner: Invoice uploaded successfully. Reference INV-REF-001. Extraction started." },
        { "stepNo": 5, "action": "Navigate to Review Dashboard", "testData": "", "expected": "Invoice INV-2024-001 listed with status Extracting and upload timestamp within last 30 seconds" }
      ],
      "priority": "critical",
      "riskScore": "high",
      "confidence": "high",
      "rationale": "Invoice upload is the entry point for all AP processing. Any failure here blocks the entire invoice lifecycle and directly impacts payment processing.",
      "traceability": "REQ-001 / Invoice Upload Page (PAGE-001) / POST /invoices/upload (API-001)"
    }$ex0$::jsonb,
    v_user_id
  )
  ON CONFLICT (org_id, name)
  DO UPDATE SET
    schema      = EXCLUDED.schema,
    example     = EXCLUDED.example,
    description = EXCLUDED.description,
    is_active   = TRUE,
    updated_at  = NOW();

  -- ══════════════════════════════════════════════════════════════════════
  -- 4. IVA SAMPLE I/O PAIRS (1D) — Few-Shot Examples
  --    4 pairs covering the 4 most important IVA workflows
  -- ══════════════════════════════════════════════════════════════════════

  -- ── Pair 1: Invoice Upload — Happy Path ──────────────────────────────
  INSERT INTO sample_io_pairs
    (org_id, title, description, category, input_example, output_example, tags, created_by)
  VALUES (
    v_org_id,
    'IVA Invoice Upload — Happy Path',
    'Example of generating a happy path test case for invoice document upload in IVA. Covers successful upload flow by an AP Clerk.',
    'FILE_PROCESSING',
    $i1${
      "requirementId": "REQ-001",
      "title": "Invoice Document Upload",
      "description": "As an AP Clerk, I want to upload invoice documents (PDF, DOCX, TIF, JPG, PNG) to the IVA system so that the AI engine can extract invoice fields for processing and approval.",
      "appType": "web",
      "module": "Invoice Processing",
      "userRoles": ["AP Clerk", "AP Supervisor"],
      "inputFields": [
        {
          "fieldName": "Invoice Document",
          "dataType": "file",
          "constraints": { "required": true, "allowedValues": ["PDF","DOCX","TIF","JPG","PNG"], "maxSize": "20MB" },
          "validValues": "PDF, DOCX, TIF, JPG, PNG files up to 20MB",
          "invalidValues": "EXE, ZIP, XLSX files; files over 20MB; corrupted/password-protected files"
        },
        {
          "fieldName": "Vendor ID",
          "dataType": "string",
          "constraints": { "required": false, "maxLength": 50 },
          "validValues": "Existing vendor code from vendor master (e.g., VND-00142)",
          "invalidValues": "Non-existent or inactive vendor codes"
        }
      ],
      "businessRules": [
        "Maximum file size: 20MB per document",
        "Supported formats: PDF, DOCX, TIF, JPG, PNG only",
        "Duplicate invoice check is performed on upload",
        "Uploaded files are virus-scanned before extraction begins",
        "AP Clerk cannot approve their own submitted invoices"
      ],
      "integrations": ["Kofax Total Agility OCR Engine", "Azure Blob Storage", "Virus Scan Service"],
      "acceptanceCriteria": [
        "GIVEN an AP Clerk is on the Upload page WHEN they upload a valid PDF invoice under 20MB THEN the system accepts the file and starts extraction within 5 seconds",
        "GIVEN an AP Clerk uploads a file over 20MB WHEN they click Upload THEN the system rejects with error File size exceeds the 20MB limit",
        "GIVEN an AP Clerk uploads an EXE file WHEN they click Upload THEN the system rejects with error Unsupported file format"
      ]
    }$i1$::jsonb,
    $o1${
      "id": "TC-001",
      "technique": "happy_path",
      "title": "Verify successful PDF invoice upload and extraction trigger by AP Clerk",
      "description": "Validates that an authenticated AP Clerk can upload a valid PDF invoice and receive confirmation that extraction has started. This is the critical smoke test for the entire IVA ingestion pipeline.",
      "preconditions": [
        "User is logged in as AP Clerk (user: apclerk@baxter.com)",
        "User is on the Invoice Upload page (/invoices/upload)",
        "Valid PDF invoice file is available: invoice_INV-2024-001.pdf (2.4 MB)",
        "Vendor VND-00142 exists and is active in the vendor master"
      ],
      "steps": [
        { "stepNo": 1, "action": "Click Browse button or drag file to the Document Upload dropzone", "testData": "invoice_INV-2024-001.pdf (2.4 MB, PDF)", "expected": "File name invoice_INV-2024-001.pdf appears in the upload area with a PDF icon and file size 2.4 MB" },
        { "stepNo": 2, "action": "Enter vendor code in the Vendor ID field", "testData": "VND-00142", "expected": "Vendor name Baxter Healthcare Ltd is auto-populated in the Vendor Name display field" },
        { "stepNo": 3, "action": "Click the Upload Invoice button", "testData": "", "expected": "Upload progress bar appears showing 0-100%; button becomes disabled to prevent duplicate submission" },
        { "stepNo": 4, "action": "Wait for upload completion (up to 10 seconds)", "testData": "", "expected": "Success banner displayed: Invoice uploaded successfully. Reference: INV-REF-2024-001. AI extraction has started." },
        { "stepNo": 5, "action": "Navigate to the Review Dashboard (/invoices/review)", "testData": "", "expected": "Invoice INV-2024-001 appears in the dashboard list with status Extracting and uploaded timestamp within the last 60 seconds" }
      ],
      "priority": "critical",
      "riskScore": "high",
      "confidence": "high",
      "rationale": "Invoice upload is the entry point for the entire IVA AP workflow. Any failure here blocks all downstream processing including extraction, approval, and ERP posting.",
      "traceability": "REQ-001 / Invoice Upload Page (PAGE-001) / POST /invoices/upload (API-001)"
    }$o1$::jsonb,
    '["invoice-upload","happy-path","file-processing","ap-clerk"]'::jsonb,
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  -- ── Pair 2: AI Extraction Accuracy — Boundary Value Analysis ─────────
  INSERT INTO sample_io_pairs
    (org_id, title, description, category, input_example, output_example, tags, created_by)
  VALUES (
    v_org_id,
    'IVA AI Field Extraction — Boundary Value Analysis',
    'Example of generating BVA test cases for AI extraction confidence thresholds. The system flags fields below 70% confidence for manual review.',
    'WORKFLOW',
    $i2${
      "requirementId": "REQ-002",
      "title": "AI Invoice Field Extraction with Confidence Scoring",
      "description": "The IVA system shall use AI/OCR to automatically extract key invoice fields from uploaded documents. Each extracted field carries a confidence score (0-100). Fields with confidence score below 70 must be flagged for manual review and highlighted in the UI. Fields at 70 or above are accepted automatically.",
      "appType": "web",
      "module": "AI Extraction",
      "userRoles": ["AP Clerk", "AP Supervisor"],
      "inputFields": [
        {
          "fieldName": "Extraction Confidence Score",
          "dataType": "decimal",
          "constraints": { "required": true, "minValue": 0, "maxValue": 100, "decimalPlaces": 2 },
          "validValues": "Any decimal value between 0.00 and 100.00",
          "invalidValues": "Values below 0, above 100, non-numeric values"
        },
        {
          "fieldName": "Invoice Total Amount",
          "dataType": "decimal",
          "constraints": { "required": true, "minValue": 0.01, "maxValue": 9999999.99, "decimalPlaces": 2 },
          "validValues": "Positive decimal with 2 decimal places",
          "invalidValues": "Zero, negative values, values exceeding 9,999,999.99"
        }
      ],
      "businessRules": [
        "Confidence score below 70: field flagged for manual review",
        "Confidence score 70-84: field accepted but shown with amber indicator",
        "Confidence score 85-100: field accepted with green indicator",
        "All flagged fields must be manually verified before the invoice can be submitted for approval"
      ],
      "acceptanceCriteria": [
        "GIVEN AI extracts a field with confidence 69 WHEN the extraction result is displayed THEN the field is flagged with status Needs Review in red",
        "GIVEN AI extracts a field with confidence 70 WHEN the extraction result is displayed THEN the field is accepted with amber indicator",
        "GIVEN AI extracts a field with confidence 85 WHEN the extraction result is displayed THEN the field is accepted with green indicator"
      ]
    }$i2$::jsonb,
    $o2${
      "id": "TC-003",
      "technique": "boundary_value_analysis",
      "title": "Verify extraction confidence threshold boundary at 70 — below threshold flags field for review",
      "description": "Tests the critical boundary condition where AI confidence score transitions from accepted to flagged at the 70% threshold. A defect here means fields requiring review pass through unchecked, directly risking incorrect invoice data.",
      "preconditions": [
        "User is logged in as AP Clerk",
        "Invoice invoice_low_conf.pdf has been uploaded successfully",
        "AI extraction has completed with the Vendor Name field returning confidence score 69"
      ],
      "steps": [
        { "stepNo": 1, "action": "Navigate to the extraction review page for invoice INV-TEST-069", "testData": "Invoice reference: INV-TEST-069", "expected": "Extraction review page loads showing all extracted fields" },
        { "stepNo": 2, "action": "Locate the Vendor Name field in the extracted fields list", "testData": "Vendor Name field with extracted value: Baxter Healthcare Ltd, confidence: 69", "expected": "Vendor Name field is highlighted in red with label Needs Review and confidence badge showing 69%" },
        { "stepNo": 3, "action": "Attempt to click Submit for Approval without editing the flagged field", "testData": "", "expected": "Submit button is disabled or shows validation error: Please review all flagged fields before submitting" },
        { "stepNo": 4, "action": "Manually correct the Vendor Name field value", "testData": "Enter: Baxter Healthcare Limited", "expected": "Vendor Name field is updated; Needs Review badge changes to Manually Verified in blue" },
        { "stepNo": 5, "action": "Click Submit for Approval", "testData": "", "expected": "Invoice moves to Pending Approval status; audit log records manual verification of Vendor Name by AP Clerk at current timestamp" }
      ],
      "priority": "critical",
      "riskScore": "high",
      "confidence": "high",
      "rationale": "The 70% confidence threshold is a core business rule. If the boundary is off by even one point, incorrectly extracted financial data (amounts, vendor names, invoice numbers) could be auto-approved, creating financial risk.",
      "traceability": "REQ-002 / Extraction Review Page (PAGE-002) / GET /invoices/{id}/extraction (API-002)"
    }$o2$::jsonb,
    '["ai-extraction","boundary-value","confidence-score","manual-review"]'::jsonb,
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  -- ── Pair 3: High-Value Invoice Approval Routing — State Transition ────
  INSERT INTO sample_io_pairs
    (org_id, title, description, category, input_example, output_example, tags, created_by)
  VALUES (
    v_org_id,
    'IVA Approval Routing — State Transition',
    'Example of generating state transition test cases for the IVA approval workflow. Invoices above 50,000 GBP escalate to Finance Director.',
    'WORKFLOW',
    $i3${
      "requirementId": "REQ-003",
      "title": "Invoice Approval Routing Based on Amount Thresholds",
      "description": "The IVA system shall route invoices for approval based on the invoice total amount. AP Supervisors approve invoices up to 50,000 GBP. Invoices exceeding 50,000 GBP must be escalated to the Finance Director. Once approved, the system posts the invoice to the ERP system automatically.",
      "appType": "web",
      "module": "Approval Workflow",
      "userRoles": ["AP Clerk", "AP Supervisor", "Finance Director"],
      "inputFields": [
        {
          "fieldName": "Invoice Total Amount",
          "dataType": "decimal",
          "constraints": { "required": true, "minValue": 0.01, "maxValue": 9999999.99 },
          "validValues": "Positive decimal value in GBP",
          "invalidValues": "Zero, negative, non-numeric"
        }
      ],
      "businessRules": [
        "Invoice total <= 50,000 GBP: routed to AP Supervisor queue",
        "Invoice total > 50,000 GBP: routed to Finance Director queue",
        "AP Clerk cannot approve their own submitted invoice",
        "Rejected invoices must include a rejection reason",
        "Approved invoices are automatically posted to SAP ERP within 2 minutes"
      ],
      "stateTransitions": [
        { "from": "Pending Review", "to": "Pending AP Approval",  "trigger": "AP Clerk submits invoice", "guard": "All flagged fields reviewed" },
        { "from": "Pending AP Approval", "to": "Approved",        "trigger": "AP Supervisor approves", "guard": "Amount <= 50000" },
        { "from": "Pending AP Approval", "to": "Pending FD Approval", "trigger": "System routes",      "guard": "Amount > 50000" },
        { "from": "Pending FD Approval", "to": "Approved",        "trigger": "Finance Director approves" },
        { "from": "Pending AP Approval", "to": "Rejected",        "trigger": "AP Supervisor rejects" },
        { "from": "Pending FD Approval", "to": "Rejected",        "trigger": "Finance Director rejects" },
        { "from": "Approved",            "to": "Posted to ERP",   "trigger": "ERP sync job runs",      "guard": "ERP connection active" }
      ],
      "integrations": ["SAP ERP (posting)", "Email Notification Service"],
      "acceptanceCriteria": [
        "GIVEN an invoice total is 49,999.99 GBP WHEN submitted for approval THEN it is routed to AP Supervisor queue",
        "GIVEN an invoice total is 50,000.01 GBP WHEN submitted for approval THEN it is routed to Finance Director queue",
        "GIVEN an approved invoice WHEN ERP sync runs THEN the invoice is posted to SAP within 2 minutes"
      ]
    }$i3$::jsonb,
    $o3${
      "id": "TC-008",
      "technique": "state_transition",
      "title": "Verify invoice escalation to Finance Director queue when total exceeds 50,000 GBP",
      "description": "Tests the critical approval routing state transition where invoices above the 50,000 GBP threshold must be escalated. A defect here could result in high-value invoices being approved by an AP Supervisor without Finance Director oversight.",
      "preconditions": [
        "User AP Clerk is logged in (user: apclerk@baxter.com)",
        "Invoice INV-HIGH-001 exists with total amount 75,000.00 GBP",
        "All extracted fields for INV-HIGH-001 have been reviewed (no flagged fields)",
        "Finance Director account (fd@baxter.com) exists and is active",
        "Invoice status is currently: Pending Review"
      ],
      "steps": [
        { "stepNo": 1, "action": "Navigate to invoice INV-HIGH-001 on the Review Dashboard", "testData": "Invoice total: 75,000.00 GBP", "expected": "Invoice detail page shows total 75,000.00 GBP and status Pending Review with all fields in Verified state" },
        { "stepNo": 2, "action": "Click Submit for Approval button", "testData": "", "expected": "Confirmation dialog appears: This invoice will be routed to Finance Director approval (amount exceeds 50,000 GBP)" },
        { "stepNo": 3, "action": "Click Confirm in the confirmation dialog", "testData": "", "expected": "Invoice status changes to Pending FD Approval; AP Clerk dashboard shows invoice removed from their queue" },
        { "stepNo": 4, "action": "Log in as Finance Director (fd@baxter.com) and navigate to Approval Queue", "testData": "User: fd@baxter.com", "expected": "Finance Director approval queue shows INV-HIGH-001 with amount 75,000.00 GBP and requester AP Clerk" },
        { "stepNo": 5, "action": "Finance Director clicks Approve", "testData": "", "expected": "Invoice status changes to Approved; ERP posting job is queued; approval notification sent to AP Clerk" },
        { "stepNo": 6, "action": "Wait up to 2 minutes and check ERP posting status", "testData": "", "expected": "Invoice status changes to Posted to ERP; SAP document number is visible in the invoice details" }
      ],
      "priority": "critical",
      "riskScore": "high",
      "confidence": "high",
      "rationale": "High-value invoice routing is a financial control. Bypassing Finance Director approval for invoices over 50,000 GBP is a compliance violation and audit finding.",
      "traceability": "REQ-003 / Approval Workflow / POST /invoices/{id}/approve (API-003)"
    }$o3$::jsonb,
    '["approval-routing","state-transition","high-value","finance-director","erp-posting"]'::jsonb,
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  -- ── Pair 4: Duplicate Invoice Detection — Decision Table ──────────────
  INSERT INTO sample_io_pairs
    (org_id, title, description, category, input_example, output_example, tags, created_by)
  VALUES (
    v_org_id,
    'IVA Duplicate Invoice Detection — Decision Table',
    'Example of generating decision table test cases for duplicate invoice detection. Duplicate is defined as: same Vendor ID + same Invoice Number + same Invoice Date.',
    'FINANCIAL',
    $i4${
      "requirementId": "REQ-004",
      "title": "Duplicate Invoice Detection and Blocking",
      "description": "The IVA system shall detect and block duplicate invoices during upload. A duplicate is defined as an invoice from the same vendor with the same invoice number and the same invoice date already existing in the system with status other than Rejected. Users must be warned with a clear error message and the reference of the existing invoice.",
      "appType": "web",
      "module": "Invoice Processing",
      "userRoles": ["AP Clerk"],
      "inputFields": [
        { "fieldName": "Vendor ID",      "dataType": "string",   "constraints": {"required": true, "maxLength": 50},  "validValues": "Active vendor code", "invalidValues": "Inactive or non-existent vendor" },
        { "fieldName": "Invoice Number", "dataType": "string",   "constraints": {"required": true, "maxLength": 100}, "validValues": "Alphanumeric invoice number as printed on document", "invalidValues": "Empty, whitespace only" },
        { "fieldName": "Invoice Date",   "dataType": "date",     "constraints": {"required": true},                  "validValues": "Date in ISO 8601 format (YYYY-MM-DD)", "invalidValues": "Future dates beyond 90 days, dates before year 2000" }
      ],
      "businessRules": [
        "Duplicate = same Vendor ID AND same Invoice Number AND same Invoice Date",
        "A rejected invoice does not count as a duplicate (re-submission is allowed)",
        "Duplicate check is case-insensitive for invoice number",
        "User must be shown the existing invoice reference and its current status",
        "Duplicate upload is blocked — user cannot bypass this check"
      ],
      "acceptanceCriteria": [
        "GIVEN vendor VND-001 has invoice INV-2024-001 dated 2024-01-15 in status Approved WHEN AP Clerk uploads another INV-2024-001 from VND-001 dated 2024-01-15 THEN upload is blocked with error Duplicate invoice detected. Reference: INV-REF-001 (Approved)",
        "GIVEN vendor VND-001 has invoice INV-2024-001 dated 2024-01-15 in status Rejected WHEN AP Clerk uploads the same invoice again THEN upload is allowed (re-submission after rejection)",
        "GIVEN vendor VND-001 has invoice INV-2024-001 dated 2024-01-15 WHEN AP Clerk uploads INV-2024-001 from a DIFFERENT vendor VND-002 THEN upload is allowed (different vendor)"
      ]
    }$i4$::jsonb,
    $o4${
      "id": "TC-012",
      "technique": "decision_table",
      "title": "Verify duplicate invoice blocked when same vendor, invoice number, and date exist in non-rejected status",
      "description": "Tests the primary duplicate detection scenario: identical Vendor ID, Invoice Number, and Invoice Date combination where the existing invoice is in an active (non-rejected) state. This is the most common duplicate submission scenario in AP workflows.",
      "preconditions": [
        "User is logged in as AP Clerk (apclerk@baxter.com)",
        "Vendor VND-00142 (Baxter Healthcare Ltd) is active in the vendor master",
        "Invoice INV-2024-0099 from vendor VND-00142 dated 2024-03-15 already exists in the system with status Approved (reference: INV-REF-0099)",
        "AP Clerk has the same invoice document ready for upload: invoice_INV-2024-0099.pdf"
      ],
      "steps": [
        { "stepNo": 1, "action": "Navigate to Invoice Upload page (/invoices/upload)", "testData": "", "expected": "Upload page loads with Document Upload dropzone and Vendor ID field visible" },
        { "stepNo": 2, "action": "Upload the duplicate invoice document to the dropzone", "testData": "invoice_INV-2024-0099.pdf (vendor: VND-00142, invoice number: INV-2024-0099, date: 2024-03-15)", "expected": "File is accepted by the dropzone; file name and size displayed correctly" },
        { "stepNo": 3, "action": "Enter Vendor ID in the Vendor ID field", "testData": "VND-00142", "expected": "Vendor name Baxter Healthcare Ltd is auto-populated" },
        { "stepNo": 4, "action": "Click Upload Invoice button", "testData": "", "expected": "System performs duplicate check; upload is blocked immediately with error banner: Duplicate invoice detected. An invoice with number INV-2024-0099 from vendor Baxter Healthcare Ltd (VND-00142) dated 15 Mar 2024 already exists. Reference: INV-REF-0099 (Status: Approved)" },
        { "stepNo": 5, "action": "Verify no new invoice record was created in the system", "testData": "", "expected": "Review Dashboard does not show a new entry for INV-2024-0099; only the original INV-REF-0099 is present" }
      ],
      "priority": "critical",
      "riskScore": "high",
      "confidence": "high",
      "rationale": "Duplicate invoice processing is one of the highest-risk scenarios in AP — it directly causes double payment. This is a mandatory financial control test case.",
      "traceability": "REQ-004 / Invoice Upload Page (PAGE-001) / POST /invoices/upload (API-001)"
    }$o4$::jsonb,
    '["duplicate-detection","decision-table","financial-control","invoice-upload"]'::jsonb,
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'IVA template seed complete for org %: input template, output template, 4 sample I/O pairs inserted', v_org_id;
END $$;
