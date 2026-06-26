-- ============================================================
-- Seed 003: Layer 1 — IVA Knowledge Base Content
--
-- UPDATED: Based on actual IVA test cases from ConsolidatedTestCase.xlsx
-- Sources: InvoiceToApEssentials (T1), MasterData (T2), Process (T3),
--          CreditNote (T5), POInvoice (T7), IncomingEmails (T8),
--          TungstenToCoupa (T10), ExpenseInvoice, Voucher (PMI) suites
--
-- 37 entries across 6 doc_types:
--   10 x requirement   (REQ-IVA-001 to -010)
--   16 x test_case     (TC-IVA-T101 to T601)
--    7 x business_rule (BR-IVA-001 to -007)
--    1 x page          (PAGE-IVA-001)
--    2 x api_endpoint  (API-IVA-001 to -002)
--    1 x entity        (ENT-IVA-001)
--
-- All rows inserted with embedding_status = PENDING.
-- After seeding, call:
--   POST /api/v1/knowledge-base/reembed-pending?projectId=<id>
--
-- Re-runnable: WHERE NOT EXISTS prevents duplicates on (project_id, doc_type, doc_id)
-- ============================================================

DO $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT id INTO v_project_id FROM projects ORDER BY created_at LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'No projects found — skipping IVA KB seed. Create a project first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding IVA KB content for project %', v_project_id;

  -- ══════════════════════════════════════════════════════════════════════
  -- REQUIREMENTS (10 entries) — from functional requirements + test pre-conditions
  -- ══════════════════════════════════════════════════════════════════════

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-001',
    'Invoice Email Ingestion via TotalAgility Classification: Suppliers send invoice documents to the AP Essentials configured mailbox as email attachments. TotalAgility email classification service monitors the mailbox and classifies each incoming email. Valid invoice PDF attachments are forwarded to AP Essentials and appear in the Verify queue within 5 minutes of receipt. Emails without any attachments are classified as non-invoice and forwarded to the designated non-invoice forwarding email address. Emails containing unsupported file types (e.g., Word .docx, Excel .xlsx) are forwarded to the non-invoice forwarding address and do not create a document or batch in AP Essentials. When an email contains multiple valid invoice PDF attachments, each invoice is ingested as a separate individual document entry in AP Essentials. Mixed emails containing both valid invoice PDFs and unsupported files result in only the valid invoice PDFs being ingested. Classification decision: valid invoice attachment → AP Essentials Verify queue; no attachment or unsupported format → non-invoice forwarding address. Module: Invoice Ingestion. Integration: TotalAgility (TA) email classification engine, AP Essentials.',
    '{"source": "T8.01-T8.05", "module": "email-ingestion", "priority": "HIGH", "integration": "TotalAgility"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-001');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-002',
    'Manual Invoice Upload via AP Essentials UI: AP Clerks and AP Supervisors can manually upload invoice documents via the AP Essentials Upload screen (Documents → Upload). The Upload screen requires: Customer account field (identifies the buyer legal entity), Buyer field (auto-enabled after customer account selection), Document type dropdown (country-specific invoice and credit note types), Document separation setting (One document per file is the default). Files are selected via the Browse button or by dragging and dropping into the drop zone. After clicking the Upload button, a success confirmation is displayed. The uploaded invoice immediately appears in the In Progress or Verify queue with correct file name, received timestamp, status, customer account, and buyer populated. Document types are country-specific and include: U.S. invoice, GB invoice, French invoice, Swedish invoice, XML invoice, and corresponding credit note types. Module: Invoice Upload. System: AP Essentials.',
    '{"source": "T1.04", "module": "invoice-upload", "priority": "HIGH", "roles": ["AP_CLERK","AP_SUPERVISOR"]}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-002');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-003',
    'Invoice Image Quality and Orientation Verification: Invoice images displayed in the AP Essentials manual verification screen must meet the following quality requirements. The image must be fully displayed in the left image pane without cropping, distortion, fading, or unreadable text. The image orientation must be correct — text must be readable in standard portrait or landscape orientation. All expected pages must be present and the page count indicator (e.g., 1/2) must accurately reflect total pages. Users can navigate between pages using page navigation arrows. Zoom in and zoom out controls must function correctly, with image remaining clear at all zoom levels. Rotate controls (left/right) must work without loading delay or image corruption. Print and Close buttons must be present in the image viewer. Module: Document Verification. System: AP Essentials.',
    '{"source": "T3.2, T5.02, T7.2", "module": "document-verification", "priority": "MEDIUM"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-003');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-004',
    'Buyer and Supplier Identification from Invoice: AP Essentials must automatically identify and populate Buyer and Supplier information from the invoice image using OCR extraction and master data matching. The BUYER AND SUPPLIER section contains: Customer account (identifies buyer legal entity), Buyer (matching Bill To address on invoice image), Supplier name (matching vendor letterhead), Supplier number (auto-populated from supplier master when name matches). Matching status indicators: Complete (exact match), Verify (possible match needs confirmation), Suggest (suggestion available), Failed (no match). If auto-identification fails, the user clicks the edit/pencil icon to manually search for or enter the correct supplier. Supplier master data is loaded from ERP via MuleSoft and is buyer-specific. All fields must show green checkmarks when correctly populated.',
    '{"source": "T3.3, T5.03, T7.3, ExpenseInvoice", "module": "buyer-supplier-identification", "priority": "HIGH"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-004');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-005',
    'General Section Field Extraction for All Invoice Types: The GENERAL section in AP Essentials must display and auto-extract the following fields for all invoice types: Document type (country-specific; e.g., U.S. invoice, GB invoice, French invoice, Swedish invoice, Italian invoice, Malaysian invoice, XML invoice, U.S. credit notes), Invoice Number, Invoice Date, Baxter Due Date, PO Number, eInvoice ID, Shipping Location, Comment, Original Invoice Number (credit notes), Original Invoice Date (credit notes), Delivery Note, Requester (buyer-filtered from master data), Payment Terms, State. Fields must be automatically extracted from the invoice image using OCR. Mandatory fields must show green checkmarks when correctly populated. The OK button only becomes green when ALL mandatory fields across all sections are validated. Country-specific Wave-1 countries: Australia, Austria, Belgium, Canada, France, Germany, Ireland, Italy, Mexico, Netherlands, Singapore, Spain, Sweden, Switzerland, UAE, United Kingdom, United States.',
    '{"source": "T3.4, T3.5, T5.05, T7.5, T7.6", "module": "general-section", "priority": "HIGH", "countries": "AU,AT,BE,CA,FR,DE,IE,IT,MX,NL,SG,ES,SE,CH,AE,GB,US"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-005');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-006',
    'Amount Section Field Extraction and Validation: The AMOUNT section in AP Essentials must extract and validate all monetary values. Required fields: Total Net Amount (subtotal before tax, must match net on invoice image), Total Tax Amount (VAT or GST; must appear even for zero-tax invoices), Total Gross Amount (must equal Total Net plus Total Tax; validated automatically), Currency (must match invoice image and be consistent across General and Amount sections). Optional: Tax fields per tax line (Taxable Amount 1, Tax Amount 1, Tax % 1), Freight charges. LINE ITEMS: Item Number, Description, Quantity, UOM, Unit Price, Net Amount per line. Validation: Sum of all line item Net Amounts must equal Total Net Amount; Gross = Net + Tax (+Freight); modifying Tax Amount triggers recalculation; changing Currency triggers recalculation or warning. For GB invoices currency must be GBP. For FR invoices, EUR.',
    '{"source": "T3.6, T10.01, Voucher, ExpenseInvoice", "module": "amount-section", "priority": "HIGH"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-006');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-007',
    'PO Matching — 2-Way and 3-Way with GRN: AP Essentials supports PO matching for PO invoices against ERP data synchronized via MuleSoft. PO number extracted from invoice triggers automatic lookup to the correct ERP. ERP routing: numeric PO numbers (e.g., 1234567) route to JDE; CO-prefix PO numbers (e.g., COXXXX) route to Coupa. 3-way matching: Invoice quantity matched against PO line quantity AND GRN (Goods Receipt Note) quantities from ERP. Multiple GRNs can be combined for a single PO line. PO lines without receipts show No Receipts and cannot be 3-way matched. 2-way matching: Invoice matched directly to PO lines without GRN (for service-based POs flagged as 2-way in ERP). PPV (Purchase Price Variance) calculated when invoice unit price differs from PO: positive PPV when invoice price exceeds PO, negative PPV when lower. Foreign currency: invoice currency must match PO currency. Additional charges: tax and freight do not block matching. Auto-Match function available.',
    '{"source": "Voucher PMI, T7.1, MasterData 2.2", "module": "po-matching", "priority": "HIGH", "integrations": ["JDE","Coupa","MuleSoft"]}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-007');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-008',
    'Credit Note Processing Pipeline: Credit notes are processed through the same AP Essentials verification pipeline as standard invoices. Credit notes appear in the Verify queue with status Pending manual verification. Document type must be set to the country-specific credit note type (e.g., U.S. credit notes, Swedish credit notes, Italian credit notes, XML credit notes). The GENERAL section for credit notes includes all standard fields plus: Original Invoice Number (links credit note to original invoice), Original Invoice Date. BUYER AND SUPPLIER section fields are identical to standard invoices. AMOUNT section captures the credit note total. Credit notes may be linked to original invoices if the original invoice reference is available on the document. Credit notes are exported to ERP via the same MuleSoft integration as invoices. Credit notes via Tungsten Network go through the TeC (Tungsten e-invoice channel). GxP applicable: Yes.',
    '{"source": "T5.01-T5.05", "module": "credit-note", "priority": "HIGH", "docType": "credit_note"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-008');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-009',
    'Master Data Synchronization via MuleSoft to AP Essentials: All master data required for invoice validation is synchronized from ERP systems to AP Essentials via MuleSoft. Supplier master data: listed per buyer; searchable by name or supplier ID; must match source ERP exactly. PO data: JDE POs (numeric format) synchronized with open PO lines, quantities, UOM, open quantity, GRN associations. Coupa POs (CO-prefix) synchronized with open lines. Requesters: buyer-specific lists filtered by buyer and country; partial text search supported; invalid entries not listed. TRAC codes: fully loaded per buyer configuration; no duplicates or obsolete entries. Tax Explanation codes: configured per SDD tax mapping. Master data validation: clearing a required dropdown value triggers yellow warning and blocks OK status. Lists refresh when buyer is changed. MuleSoft acts as integration middleware for all ERP systems.',
    '{"source": "MasterData 2.1-2.3", "module": "master-data", "priority": "HIGH", "integration": "MuleSoft"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-009');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'requirement', 'REQ-IVA-010',
    'ERP Export, Routing, and Status Updates via MuleSoft: After verification and approval in AP Essentials, invoices are exported to the target ERP via MuleSoft. MuleSoft retrieves invoice data and invoice image link from AP Essentials API. ERP routing: numeric PO → JDE; CO-prefix PO → Coupa; country-based routing: GB and FR entities route to Coupa. Target ERPs: SAP, JDE (JD Edwards), Coupa. Successful export status: Document Post Succeeded. ERP document number is returned and stored in AP Essentials. Invoice image link is transmitted to ERP so the image is accessible from ERP. Reverse voucher: when a voucher is reversed in ERP, a callback triggers TeC (Tungsten Network) to reopen the document; status in KAE/AP Essentials is updated. Non-PO invoices route to ERP coding and approval workflow. E-invoices from Tungsten Network or Peppol bypass OCR and go through schema and compliance validation.',
    '{"source": "T10.01, T10.02, Voucher-ReverseTungsten, functional-requirements", "module": "erp-export", "priority": "HIGH", "targets": ["SAP","JDE","Coupa"]}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'requirement' AND doc_id = 'REQ-IVA-010');

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST CASES (16 entries) — structured per sampleoutputtemplate.json
  -- ══════════════════════════════════════════════════════════════════════

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T101',
    'Test Case TC-IVA-T101 — User Login to AP Essentials (Happy Path). Technique: happy_path. Priority: critical. RiskScore: high. Confidence: high. Preconditions: User has valid credentials; browser available; AP Essentials URL: https://kofaxcloud-us.readsoftonline.com/html. Steps: (1) Open browser and navigate to AP Essentials URL — Expected: login screen displayed. (2) Enter valid username — Expected: username accepted and visible in field. (3) Enter valid password — Expected: password accepted and masked. (4) Click Login button — Expected: login successful; main application page loads; logged-in username displayed in top-right corner. (5) Verify left navigation panel shows DOCUMENTS section (Upload, Assigned to me, Verify, Rejected, On hold, In progress, Processed, All documents) and STORAGE section (Documents, Files) — Expected: all navigation items present and enabled. (6) Click Log out — Expected: user logged out; login screen re-displayed. Rationale: Verifies the critical access gate for AP Essentials. Login failure blocks all invoice processing operations. Traceability: T1.01.',
    '{"sourceTest": "T1.01", "technique": "happy_path", "priority": "critical", "riskScore": "high", "confidence": "high", "gxp": true, "module": "user-access"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T101');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T102',
    'Test Case TC-IVA-T102 — User Privilege Visibility Matches Assigned Role. Technique: equivalence_partitioning. Priority: high. RiskScore: high. Confidence: high. Preconditions: User has valid staff credentials for AP Essentials. Steps: (1) Log in — Expected: main page loads; username at top-right. (2) Observe left navigation DOCUMENTS section — Expected: Upload (requires UPLOAD privilege), Assigned to me (requires APPROVE/MANAGE), Verify (requires VERIFY), Rejected/On hold/In progress/Processed/All documents (require VERIFY/APPROVE/MANAGE). (3) Verify STORAGE section — Expected: Documents and Files visible with STORAGE privilege. (4) Click Upload, Verify, In progress, All documents — Expected: each loads correctly; Upload shows Customer account, Buyer, Document type, Document separation fields and dropzone; Verify shows pending documents. (5) Verify customer account dropdown shows All customers and configured customer account. Rationale: Role-based access control ensures users see only what their privileges allow. Incorrect access could expose sensitive financial data. Traceability: T1.02.',
    '{"sourceTest": "T1.02", "technique": "equivalence_partitioning", "priority": "high", "riskScore": "high", "confidence": "high", "gxp": true, "module": "user-access"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T102');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T103',
    'Test Case TC-IVA-T103 — Single Invoice Email Ingested into AP Essentials Verify Queue. Technique: happy_path. Priority: critical. RiskScore: high. Confidence: high. Preconditions: AP Essentials configured to receive emails at known inbox; non-invoice forwarding address configured; valid invoice PDF available; TotalAgility email classification active. Steps: (1) Create email to AP Essentials inbox with one valid invoice PDF attached — Expected: draft ready. (2) Send email; note sending time — Expected: sent with no delivery failure. (3) Log in to AP Essentials; navigate to Documents → Verify; wait up to 5 minutes and refresh — Expected: invoice appears in Verify queue with status Pending manual verification, correct file name, received timestamp. (4) Switch to Batches view — Expected: invoice batch visible with correct details. (5) Check non-invoice forwarding inbox — Expected: invoice email was NOT forwarded there; only in AP Essentials. Rationale: Email ingestion is the primary invoice capture channel. Failure means invoices never reach AP Essentials for processing. Traceability: REQ-IVA-001 / T8.01.',
    '{"sourceTest": "T8.01", "technique": "happy_path", "priority": "critical", "riskScore": "high", "confidence": "high", "gxp": true, "module": "email-ingestion"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T103');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T104',
    'Test Case TC-IVA-T104 — Email Without Attachments Forwarded to Non-Invoice Address (Negative). Technique: negative_validation. Priority: high. RiskScore: high. Confidence: high. Preconditions: AP Essentials email inbox configured; non-invoice forwarding address configured; TotalAgility active. Steps: (1) Create email to AP Essentials inbox with NO attachments, any text in body — Expected: draft ready with no attachments. (2) Send email — Expected: sent successfully. (3) Log in to AP Essentials; navigate to Documents → All documents; search by timestamp — Expected: NO new document created in AP Essentials for the no-attachment email. (4) Check Batches view — Expected: NO new batch created. (5) Check non-invoice forwarding inbox — Expected: the no-attachment email IS present in the non-invoice forwarding inbox. Rationale: Emails without attachments are not invoices. Allowing them into AP Essentials creates empty invalid document entries and pollutes the Verify queue. Traceability: REQ-IVA-001 / T8.02.',
    '{"sourceTest": "T8.02", "technique": "negative_validation", "priority": "high", "riskScore": "high", "confidence": "high", "gxp": true, "module": "email-classification"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T104');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T105',
    'Test Case TC-IVA-T105 — Email With Unsupported File (.docx) Forwarded to Non-Invoice Address (Negative). Technique: negative_validation. Priority: high. RiskScore: high. Confidence: high. Preconditions: AP Essentials email inbox configured; non-invoice forwarding address configured; Word .docx file available; TotalAgility active. Steps: (1) Create email to AP Essentials inbox with a Word .docx file attached — Expected: draft ready with .docx attachment. (2) Send email — Expected: sent successfully. (3) Log in to AP Essentials; check Documents → All documents and Batches — Expected: NO new document or batch created in AP Essentials for the unsupported attachment. (4) Check non-invoice forwarding inbox — Expected: the email with .docx IS present in the non-invoice forwarding inbox. Rationale: TotalAgility must correctly filter unsupported file types. Allowing non-PDF/non-invoice files through would create invalid OCR extraction attempts. Traceability: REQ-IVA-001 / T8.03.',
    '{"sourceTest": "T8.03", "technique": "negative_validation", "priority": "high", "riskScore": "high", "confidence": "high", "gxp": true, "module": "email-classification"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T105');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T106',
    'Test Case TC-IVA-T106 — Email With Multiple Invoice Attachments — All Ingested as Separate Documents. Technique: equivalence_partitioning. Priority: high. RiskScore: medium. Confidence: high. Preconditions: AP Essentials email inbox configured; 2-3 valid invoice PDFs available; TotalAgility active. Steps: (1) Create email to AP Essentials inbox with multiple valid invoice PDFs attached — Expected: draft ready with multiple PDFs. (2) Send email; note count and time — Expected: sent successfully. (3) Log in to AP Essentials; navigate to Verify queue; wait up to 10 minutes and refresh — Expected: ALL invoice attachments appear as individual separate document entries in Verify queue with correct file names, timestamps, and Pending manual verification status. (4) Check Batches view — Expected: all invoices visible as individual or grouped batches. (5) Check non-invoice forwarding inbox — Expected: none of the invoice attachments forwarded there. Rationale: Batch email delivery is common from suppliers. All attachments must be individually processed. Traceability: REQ-IVA-001 / T8.04.',
    '{"sourceTest": "T8.04", "technique": "equivalence_partitioning", "priority": "high", "riskScore": "medium", "confidence": "high", "gxp": true, "module": "email-ingestion"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T106');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T201',
    'Test Case TC-IVA-T201 — Invoice Image Quality Fully Visible Without Distortion. Technique: happy_path. Priority: high. RiskScore: medium. Confidence: high. Preconditions: Invoice present in AP Essentials via integration; integrations active. Steps: (1) Navigate to All documents; click eye icon to open invoice viewer — Expected: document image displayed in pop-up. (2) Verify image fully displayed without cropping, distortion, fade, or unreadable text; Print and Close buttons present — Expected: image fully visible without issues. (3) Verify invoice image contains expected fields: Address, Invoice date and number, Bill to, Ship to, S.O. No., P.O. No., Terms, Projects, Items and details, Total, Payments/Credit, Balance due — Expected: all fields visible on image. (4) Verify correct orientation — text readable without rotation — Expected: image correctly oriented. (5) Use zoom controls; image remains clear — Expected: legible at zoom levels; no excessive pixelation. Rationale: Image quality directly impacts OCR extraction accuracy. Poor quality leads to incorrect field extraction and payment errors. Traceability: REQ-IVA-003 / T3.2.',
    '{"sourceTest": "T3.2", "technique": "happy_path", "priority": "high", "riskScore": "medium", "confidence": "high", "gxp": false, "module": "document-verification"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T201');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T202',
    'Test Case TC-IVA-T202 — Buyer and Supplier Correctly Captured and Match Invoice Image. Technique: happy_path. Priority: critical. RiskScore: high. Confidence: high. Preconditions: Invoice present in AP Essentials via integration; downstream/upstream integrations active. Steps: (1) Navigate to All documents; select invoice checkbox; click Start — Expected: document opens with image at center pane; data panel on right. (2) In BUYER AND SUPPLIER section, verify Customer account, Buyer, Supplier name, Supplier number all populated — Expected: section visible with all fields. (3) Compare Buyer field against Bill To address on invoice image — Expected: Buyer name matches exactly. (4) Compare Supplier name against vendor letterhead on invoice image — Expected: Supplier name matches. (5) If mismatch, click pencil icon and search/select correct supplier — Expected: correct supplier set; Supplier number auto-populated. (6) Navigate back — Expected: dashboard displayed. Rationale: Incorrect buyer or supplier identification causes invoices posted to wrong entities, creating financial errors and audit findings. Traceability: REQ-IVA-004 / T3.3.',
    '{"sourceTest": "T3.3", "technique": "happy_path", "priority": "critical", "riskScore": "high", "confidence": "high", "gxp": false, "module": "buyer-supplier"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T202');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T203',
    'Test Case TC-IVA-T203 — All Expected General Section Fields Present. Technique: happy_path. Priority: high. RiskScore: high. Confidence: high. Preconditions: Invoice present in AP Essentials via integration; downstream/upstream integrations active. Steps: (1) Navigate to All documents; select invoice; click Start — Expected: document opens with image and data panel. (2) Verify GENERAL section contains ALL of: Document type, Invoice Number, Invoice Date, Baxter Due Date, PO Number, eInvoice ID, Shipping Location, Comment, Original Invoice Number, Original Invoice Date, Delivery Note, Requester, Payment Terms, State — Expected: all fields present and visible with correct labels. (3) Verify field labels exactly match specification — Expected: labels exact match. (4) For fields not auto-extracted, verify they are present but empty — Expected: fields present, empty if not on image. Rationale: Missing fields in the General section prevent complete invoice verification and cause export failures or incorrect ERP posting. Traceability: REQ-IVA-005 / T3.4.',
    '{"sourceTest": "T3.4", "technique": "happy_path", "priority": "high", "riskScore": "high", "confidence": "high", "gxp": false, "module": "general-section"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T203');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T301',
    'Test Case TC-IVA-T301 — Credit Note Opens in AP Essentials Verify Queue. Technique: happy_path. Priority: critical. RiskScore: high. Confidence: high. Preconditions: User logged in with valid credentials; credit note present in Verify queue; downstream/upstream integrations active; JDE ERP accessible. Steps: (1) Navigate to Documents → Verify; observe list — Expected: Verify queue displayed; at least one credit note visible with status Pending manual verification. (2) Locate credit note; note Track ID, File Name, Customer Account, Buyer — Expected: credit note identified; all fields populated. (3) Check checkbox to select credit note row — Expected: checkbox checked; row highlighted. (4) Click green Start button — Expected: credit note opens in manual verification screen; image in left pane; data panel on right with BUYER AND SUPPLIER, GENERAL, AMOUNT, LINE ITEMS sections; Track ID in top-right. (5) Verify Track ID on processing screen matches Track ID noted in step 2 — Expected: Track IDs match exactly. (6) Verify document image fully loaded without errors — Expected: credit note image fully rendered. Rationale: Credit notes must flow through the same verification pipeline as invoices. Failure to open blocks credit note processing and ERP reconciliation. Traceability: REQ-IVA-008 / T5.01.',
    '{"sourceTest": "T5.01", "technique": "happy_path", "priority": "critical", "riskScore": "high", "confidence": "high", "gxp": true, "module": "credit-note"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T301');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T302',
    'Test Case TC-IVA-T302 — Credit Note Document Type Correct for Selected Country. Technique: equivalence_partitioning. Priority: high. RiskScore: high. Confidence: high. Preconditions: User logged in; credit note in Verify queue; integrations active. Steps: (1) Open credit note from Verify queue by selecting and clicking Start — Expected: processing screen displayed. (2) Scroll to GENERAL section; locate Document type dropdown; note value — Expected: Document type populated (e.g., U.S. credit notes). (3) Verify Document type corresponds to correct country: U.S. credit note = U.S. credit notes; Swedish credit note = Swedish credit notes; Swiss credit note = Swiss credit notes; XML credit note = XML type — Expected: correct country-specific credit note type; green checkmark. (4) If incorrect, click dropdown and select correct type — Expected: field updated. Rationale: Incorrect document type causes incorrect validation rules and export failures or compliance violations in country-specific regulatory environments. Traceability: REQ-IVA-008 / T5.04.',
    '{"sourceTest": "T5.04", "technique": "equivalence_partitioning", "priority": "high", "riskScore": "high", "confidence": "high", "gxp": true, "module": "credit-note"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T302');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T401',
    'Test Case TC-IVA-T401 — PO Invoice Buyer and Supplier Match Invoice Image. Technique: happy_path. Priority: critical. RiskScore: high. Confidence: high. Preconditions: Staff user access; PO invoice (Direct/Indirect/Non-PO) present via integration; integrations active. Steps: (1) Navigate to All documents; select PO invoice checkbox; click Start — Expected: document opens with image and data panel. (2) In BUYER AND SUPPLIER section, note Customer account, Buyer, Supplier name, Supplier number — Expected: all fields visible. (3) Compare Buyer against Bill To on PO invoice image — Expected: Buyer matches. (4) Compare Supplier name against vendor name on PO invoice — Expected: Supplier name matches. (5) If mismatch, click pencil icon and update — Expected: correct supplier set; Supplier number auto-populated. (6) Navigate back — Expected: dashboard displayed. Rationale: PO invoices must route to correct legal entity and vendor. Buyer/supplier mismatch causes PO matching failures and incorrect ERP posting. Traceability: REQ-IVA-004 / T7.3.',
    '{"sourceTest": "T7.3", "technique": "happy_path", "priority": "critical", "riskScore": "high", "confidence": "high", "gxp": false, "module": "po-invoice", "invoiceType": "PO"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T401');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T402',
    'Test Case TC-IVA-T402 — PO Invoice Document Type Matches Country-Specific Requirements. Technique: equivalence_partitioning. Priority: high. RiskScore: high. Confidence: high. Preconditions: Staff user access; country-specific PO invoice present; integrations active. Steps: (1) Navigate to All documents; select PO invoice; click Start — Expected: document opens. (2) Verify Document type in GENERAL section matches country-specific requirements — Expected: correct document type displayed. (3) Verify PO invoice matches country-specific format for Wave-1 countries: Australia, Austria, Belgium, Canada, France, Germany, Ireland, Italy, Mexico, Netherlands, Singapore, Spain, Sweden, Switzerland, UAE, United Kingdom, United States — Expected: document matches country format. (4) Log out — Expected: successfully logged out. Rationale: Country-specific document types ensure correct VAT/tax handling and regulatory compliance. Wrong type causes export validation failure at ERP. Traceability: REQ-IVA-005 / T7.4.',
    '{"sourceTest": "T7.4", "technique": "equivalence_partitioning", "priority": "high", "riskScore": "high", "confidence": "high", "gxp": false, "module": "po-invoice", "countries": "Wave-1 17 countries"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T402');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T501',
    'Test Case TC-IVA-T501 — PO Exact 3-Way Match (Invoice = PO = GRN). Technique: happy_path. Priority: critical. RiskScore: high. Confidence: high. Preconditions: JDE PO where invoice quantity = PO quantity = GRN quantity; prices match; no variances; invoice references this PO; receipts fully available via MuleSoft sync. Steps: (1) Open PO invoice in Verify — Expected: PO number extracted. (2) PO number triggers JDE lookup — Expected: correct PO lines and GRNs display. (3) Open PO Matching panel — Expected: all lines displayed for matching. (4) Click Auto-Match or manually select matching GRNs — Expected: all lines match without discrepancies. (5) Compare invoice line quantity and price with PO — Expected: exact match; no PPV. (6) Confirm GRN quantity fully covers invoice quantity — Expected: receipt coverage complete. (7) Click Verify — Expected: matching successful; status = OK; ready for export to JDE. Rationale: Exact 3-way match is the ideal PO invoice scenario and must flow through to ERP export without manual intervention. Traceability: REQ-IVA-007 / Voucher PMI exact-match.',
    '{"sourceTest": "Voucher-exact-match", "technique": "happy_path", "priority": "critical", "riskScore": "high", "confidence": "high", "gxp": false, "module": "po-matching", "matchType": "3-way"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T501');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T502',
    'Test Case TC-IVA-T502 — 2-Way PO Match Without GRN Requirement. Technique: state_transition. Priority: high. RiskScore: high. Confidence: high. Preconditions: ERP PO flagged for 2-way match; invoice referencing this PO; PO lines fully open. Steps: (1) Open PO invoice in Verify — Expected: invoice loads; PO Reference detected. (2) Enter or select PO number — Expected: PO lines appear; NO GRNs expected for 2-way POs. (3) Observe PO Match panel — Expected: system allows direct matching without GRN requirement. (4) Select PO line — Expected: match accepted; no receipt validation required. (5) Ensure invoice quantity and price equal PO values — Expected: no PPV or variance warnings. (6) Click Verify — Expected: OK state; ready for export to JDE or Coupa. Rationale: 2-way match is for service-based POs. The system must not block 2-way POs waiting for non-existent GRNs. Traceability: REQ-IVA-007 / Voucher 2-way-match.',
    '{"sourceTest": "Voucher-2-way", "technique": "state_transition", "priority": "high", "riskScore": "high", "confidence": "high", "gxp": false, "module": "po-matching", "matchType": "2-way"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T502');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'test_case', 'TC-IVA-T601',
    'Test Case TC-IVA-T601 — GB United Kingdom Invoice Processed and Posted to Coupa. Technique: state_transition. Priority: critical. RiskScore: high. Confidence: high. GxP: Yes. Preconditions: Valid credentials; GB invoice received from ERP into AP Essentials via upstream integration; downstream integration to Coupa active; invoice in Verify queue. Steps: (1) Log in; navigate to Documents → Verify; locate GB invoice; note Track ID, File Name, Customer Account, Buyer for GB entity — Expected: GB invoice in Verify queue. (2) Select; click Start — Expected: invoice opens; BUYER AND SUPPLIER, GENERAL, AMOUNT, LINE ITEMS sections visible. (3) Verify BUYER AND SUPPLIER: Customer account = GB entity; Buyer matches GB Bill To; Supplier matches image; Supplier number populated — Expected: all correct; green checkmarks. (4) Verify GENERAL: Document type = correct GB/UK type; Invoice Number, Invoice Date (UK format), Baxter Due Date, PO Number, Payment Terms match image — Expected: all correct; green checkmarks. (5) Verify AMOUNT: Total Net (GBP), Total Tax (VAT), Gross = Net + Tax; Currency = GBP — Expected: amounts correct; GBP currency. (6) Click green OK — Expected: invoice submitted; document moves to next status. (7) Monitor status in All documents — Expected: status updates to Document Post Succeeded. (8) Document Track ID and invoice details for Coupa team verification. Rationale: GB to Coupa is a critical integration path. Failure blocks UK AP processing and payment. Traceability: REQ-IVA-010 / T10.01.',
    '{"sourceTest": "T10.01", "technique": "state_transition", "priority": "critical", "riskScore": "high", "confidence": "high", "gxp": true, "module": "erp-integration", "country": "GB", "targetERP": "Coupa"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'test_case' AND doc_id = 'TC-IVA-T601');

  -- ══════════════════════════════════════════════════════════════════════
  -- BUSINESS RULES (7 entries)
  -- ══════════════════════════════════════════════════════════════════════

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'business_rule', 'BR-IVA-001',
    'Email Classification Rules — Invoice vs Non-Invoice Routing via TotalAgility: Rule 1: Email with valid invoice PDF attachment → forward to AP Essentials → document appears in Verify queue within 5 minutes. Rule 2: Email with no attachments → classify as non-invoice → forward to designated non-invoice forwarding email address → NO document created in AP Essentials. Rule 3: Email with unsupported attachment type (Word .docx, Excel .xlsx, ZIP) → classify as non-invoice → forward to non-invoice forwarding address → NO document or batch created. Rule 4: Email with multiple valid invoice PDFs → each invoice ingested as a separate individual document in AP Essentials. Rule 5: Email with mixed attachments (valid PDF + unsupported file) → only valid invoice PDFs ingested; unsupported files handled per configuration. The non-invoice forwarding address is a separate inbox for manual review. Source: T8.01-T8.05.',
    '{"source": "T8.01-T8.05", "module": "email-classification", "system": "TotalAgility", "ruleType": "routing"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'business_rule' AND doc_id = 'BR-IVA-001');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'business_rule', 'BR-IVA-002',
    'PO Routing Rules — JDE vs Coupa Based on PO Number Pattern: MuleSoft applies the following routing logic for PO invoice lookup and export. Rule 1 — JDE routing: PO numbers in numeric format (e.g., 1234567) are routed to JDE (JD Edwards). JDE PO lookup returns PO lines with quantities, UOM, open quantities, and GRN/receipt data. Rule 2 — Coupa routing: PO numbers prefixed with CO (e.g., CO12345) are routed to Coupa. Coupa PO lines and statuses returned for matching. Rule 3 — Automatic system detection: AP Essentials / MuleSoft automatically distinguishes target system based on PO pattern without user intervention. Mismatched PO numbers raise alerts. Rule 4 — Buyer consistency: PO lookup must return a Buyer (external ID) consistent with Invoice Buyer; mismatches raise alerts. Rule 5 — Country-based routing: GB and FR entities route to Coupa regardless of PO pattern. Source: MasterData, T10.01-T10.02.',
    '{"source": "MasterData, T10.01-T10.02", "module": "po-routing", "system": "MuleSoft", "ruleType": "routing"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'business_rule' AND doc_id = 'BR-IVA-002');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'business_rule', 'BR-IVA-003',
    'Amount Validation Rules — Gross Must Equal Net Plus Tax: Rule 1: Total Gross Amount must equal Total Net Amount plus Total Tax Amount (Gross = Net + Tax). When Freight charges are included: Gross = Net + Tax + Freight. Discrepancy prevents OK status. Rule 2: Sum of all Line Item Net Amounts must equal Total Net Amount. Line-item imbalance prevents invoice completion. Rule 3: Currency must be consistent — General section currency must match Amount section currency. Changing currency triggers recalculation or warning. Rule 4: Modifying Tax Amount triggers recalculation of Gross Amount. Rule 5: For GB invoices, currency must be GBP. For FR invoices, EUR. Rule 6: Zero-tax invoices must still display Total Tax Amount field (showing 0.00). Rule 7: Foreign currency PO matching requires invoice currency to match PO currency; mismatched currency triggers a warning. Source: T10.01, T3.6, Voucher.',
    '{"source": "T10.01, T3.6, Voucher", "module": "amount-validation", "ruleType": "financial-validation"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'business_rule' AND doc_id = 'BR-IVA-003');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'business_rule', 'BR-IVA-004',
    'Mandatory Field Validation — OK Button Green Status Gate: Rule 1: The OK button (green) in the AP Essentials toolbar becomes active only when ALL mandatory fields across ALL sections (BUYER AND SUPPLIER, GENERAL, AMOUNT, LINE ITEMS) are correctly populated and show green checkmarks. Rule 2: Any mandatory field that is empty, invalid, or in yellow warning state prevents the OK button from being clicked. Rule 3: Yellow warning indicators signal incomplete, unverified, or conflicting data. Rule 4: Clearing a mandatory field after it was set triggers a yellow warning for that field. Rule 5: Mandatory fields vary by document type and buyer country configuration. Rule 6: The Requester field, when a required dropdown value is cleared, triggers yellow warning and blocks OK status. Rule 7: Validation warnings are field-specific and do not cascade to the entire form. Source: T1.02, T3.4, T5.05, T10.01.',
    '{"source": "T3.4, T5.05, T10.01", "module": "field-validation", "ruleType": "validation-gate"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'business_rule' AND doc_id = 'BR-IVA-004');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'business_rule', 'BR-IVA-005',
    'Document Type Rules — Country-Specific Invoice and Credit Note Types: AP Essentials uses country-specific document types for all invoice and credit note processing. Wave-1 country document type mapping: Australia — AU invoice / AU credit note; Austria — AT invoice; Belgium — BE invoice; Canada — CA invoice; France — French invoice / French credit note; Germany — DE invoice; Ireland — IE invoice; Italy — Italian invoice / Italian credit note; Mexico — MX invoice; Netherlands — NL invoice; Singapore — SG invoice; Spain — ES invoice; Sweden — Swedish invoice / Swedish credit notes; Switzerland — Swiss invoice / Swiss credit note; UAE — AE invoice; United Kingdom — GB invoice / UK credit note; United States — U.S. invoice / U.S. credit notes. XML e-invoice type: XML invoice for structured e-invoices from Tungsten Network or Peppol. Document type must be validated; incorrect type blocks export. Source: T5.04, T7.4, T10.01, T10.02.',
    '{"source": "T5.04, T7.4, T10.01", "module": "document-type", "countries": "AU,AT,BE,CA,FR,DE,IE,IT,MX,NL,SG,ES,SE,CH,AE,GB,US", "ruleType": "classification"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'business_rule' AND doc_id = 'BR-IVA-005');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'business_rule', 'BR-IVA-006',
    'PO Matching Rules — 2-Way vs 3-Way GRN Requirements: 3-Way Matching Rules: Invoice must be matched against both PO lines AND GRN (Goods Receipt Note) quantities from ERP. GRNs synchronized from ERP via MuleSoft. Multiple GRNs can be combined for a single PO line until invoice quantity is covered. PO lines without GRNs show No Receipts and CANNOT be 3-way matched. All matched PO lines show OK/green status. 2-Way Matching Rules: Invoice matched directly to PO lines WITHOUT GRN requirement. Service-based POs typically use 2-way matching. Additional charges (tax, freight, environmental fees) supported in both 2-way and 3-way matching — they do not block matching. PPV calculation: system calculates Purchase Price Variance when invoice unit price differs from PO. Positive PPV: invoice price exceeds PO. Negative PPV: invoice price is lower than PO. Foreign currency: invoice and PO must share same currency; AP Essentials displays values as-is; ERP handles exchange rate at posting. Source: Voucher PMI test suite.',
    '{"source": "Voucher PMI suite", "module": "po-matching", "ruleType": "matching-rules"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'business_rule' AND doc_id = 'BR-IVA-006');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'business_rule', 'BR-IVA-007',
    'User Access Privilege Rules for AP Essentials Navigation: UPLOAD privilege: required for Documents → Upload screen access. VERIFY privilege: required for Documents → Verify queue. APPROVE privilege: required for Documents → Assigned to me queue. MANAGE privilege: grants access to Rejected, On hold, In progress, Processed, and All documents. STORAGE privilege: required for STORAGE section (Documents, Files). Manual document separation privilege: grants access to On hold and In progress. Navigation items visible to a user must exactly match the privileges assigned to their role. Customer account dropdown must show only accounts the user is authorized to access; includes All customers option plus configured customer accounts. Each navigation item must load the corresponding screen without errors. No navigation item should be visible if user does not have the required privilege. Source: T1.02.',
    '{"source": "T1.02", "module": "user-access", "ruleType": "access-control"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'business_rule' AND doc_id = 'BR-IVA-007');

  -- ══════════════════════════════════════════════════════════════════════
  -- PAGE (1 entry — AP Essentials Verification Screen)
  -- ══════════════════════════════════════════════════════════════════════

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'page', 'PAGE-IVA-001',
    'AP Essentials Manual Verification Screen — Core Invoice Processing UI. URL: https://kofaxcloud-us.readsoftonline.com/html. Layout: Left image pane shows invoice or credit note image. Right data panel shows all extracted and editable fields in sections. Top toolbar: OK button (green = all fields validated), Start button (opens selected document), Document list view button (returns to queue). Image pane controls: page navigation arrows, page count indicator (e.g., 1/2), zoom in/out, rotate left/right, Print button, Close button. Right panel sections: (1) BUYER AND SUPPLIER — Customer account, Buyer, Supplier name (with pencil/edit icon for manual correction), Supplier number. (2) GENERAL — Document type, Invoice Number, Invoice Date, Baxter Due Date, PO Number, eInvoice ID, Shipping Location, Comment, Original Invoice Number, Original Invoice Date, Delivery Note, Requester (dropdown filtered by buyer), Payment Terms, State. (3) AMOUNT — Total Net Amount, Total Tax Amount, Total Gross Amount, Currency, tax breakdown (Taxable Amount 1, Tax Amount 1, Tax % 1), Freight. (4) LINE ITEMS — Item Number, Description, Quantity, UOM, Unit Price, Net Amount per line; plus button to add lines. (5) PO MATCH panel (PO invoices) — PO lines with GRNs for 2-way or 3-way matching; Auto-Match button. Field status: green checkmark (validated), yellow warning (attention needed), red (failed/invalid). Track ID in top-right area. Left navigation queues: Upload, Assigned to me, Verify, Rejected, On hold, In progress, Processed, All documents; STORAGE: Documents, Files.',
    '{"source": "T1.02, T3.1-T3.6, T5.01-T5.05, T7.1-T7.6, T10.01-T10.02", "system": "AP Essentials", "url": "https://kofaxcloud-us.readsoftonline.com/html"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'page' AND doc_id = 'PAGE-IVA-001');

  -- ══════════════════════════════════════════════════════════════════════
  -- API ENDPOINTS (2 entries)
  -- ══════════════════════════════════════════════════════════════════════

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'api_endpoint', 'API-IVA-001',
    'AP Essentials API — Invoice Data Retrieval by MuleSoft for ERP Export: AP Essentials exposes an API consumed by MuleSoft to retrieve processed invoice data for ERP export. MuleSoft retrieves: (1) Invoice header data — Track ID, Invoice Number, Invoice Date, Supplier, Buyer, Document type, Currency, all GENERAL section values, all AMOUNT section values. (2) Invoice image link — URL pointing to invoice document image in AP Essentials; transmitted to ERP so image is accessible from ERP. (3) Line item data — all LINE ITEMS section values per invoice. MuleSoft retrieval is triggered after invoice reaches OK status. MuleSoft applies routing logic: numeric PO → JDE; CO-prefix → Coupa; GB/FR → Coupa. After successful ERP posting, MuleSoft sends ERP document number back to AP Essentials. Successful export status in AP Essentials: Document Post Succeeded. Integration: MuleSoft as middleware between AP Essentials and ERP systems.',
    '{"source": "functional-requirements, T10.01", "system": "MuleSoft", "direction": "AP Essentials → MuleSoft → ERP"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'api_endpoint' AND doc_id = 'API-IVA-001');

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'api_endpoint', 'API-IVA-002',
    'MuleSoft Master Data Sync API — Bidirectional Sync Between ERP and AP Essentials: MuleSoft orchestrates master data synchronization from ERP systems to AP Essentials. Sync scope: (1) Supplier master data — from source ERP; includes supplier ID, supplier name, VAT, address, country, payment terms; buyer-specific lists. (2) PO data — JDE POs (numeric format) with open PO lines, quantities, UOM, open quantity, GRN/receipt data. Coupa POs (CO-prefix) with lines and statuses. (3) Requesters — buyer-specific filtered lists. (4) TRAC codes — fully loaded per buyer configuration; no duplicates. (5) Tax Explanation codes — per SDD tax mapping. Verification: after sync, all master data visible and selectable in AP Essentials dropdowns; data must match source ERP exactly. Buyer-filtering: lists refresh when buyer is changed. Triggers: PO lookup triggered when user enters PO Number in GENERAL section; system routes to JDE or Coupa based on PO pattern.',
    '{"source": "MasterData 2.1-2.3", "system": "MuleSoft", "direction": "ERP → MuleSoft → AP Essentials", "dataTypes": ["suppliers","POs","GRNs","requesters","TRAC-codes","tax-codes"]}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'api_endpoint' AND doc_id = 'API-IVA-002');

  -- ══════════════════════════════════════════════════════════════════════
  -- ENTITY (1 entry — core invoice data model)
  -- ══════════════════════════════════════════════════════════════════════

  INSERT INTO knowledge_vectors (project_id, doc_type, doc_id, content, metadata, embedding_status)
  SELECT v_project_id, 'entity', 'ENT-IVA-001',
    'Invoice Entity — Core Data Model for IVA Processing: The invoice entity represents a single invoice document processed through the IVA pipeline. Key fields: Track ID (unique AP Essentials identifier), Invoice Number (as printed on document), Invoice Date, Baxter Due Date (payment due date per Baxter policy), Supplier Name, Supplier Number (ERP vendor master code), Customer Account (buyer legal entity), Buyer (Baxter entity name), Document Type (country-specific classification per Wave-1 country list), PO Number (links to ERP purchase order; drives JDE or Coupa routing based on pattern), eInvoice ID (Tungsten Network document reference), Currency, Total Net Amount, Total Tax Amount, Total Gross Amount, Payment Terms, Shipping Location, Requester (buyer-filtered master data), TRAC Code, Tax Explanation Code, Original Invoice Number (credit notes), Original Invoice Date (credit notes), Delivery Note, State, Comment. Status lifecycle in AP Essentials: Pending manual verification → In Progress → Processed. Export status: Document Post Succeeded / Document Post Failed. ERP fields: ERP Document Number (returned after posting), ERP system target (JDE / Coupa / SAP). GRN associations for 3-way PO matching. PPV variance for price differences. The invoice entity is the central object for all IVA processing — from ingestion through OCR extraction, manual verification, PO matching, approval, and ERP export.',
    '{"source": "T1.04, T3.4, T5.05, T7.5, T10.01", "module": "invoice-entity", "type": "core-entity"}'::jsonb,
    'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_vectors WHERE project_id = v_project_id AND doc_type = 'entity' AND doc_id = 'ENT-IVA-001');

  RAISE NOTICE 'IVA KB seed complete for project %: 37 entries (10 requirements, 16 test_cases, 7 business_rules, 1 page, 2 api_endpoints, 1 entity) — all PENDING embedding', v_project_id;
  RAISE NOTICE 'Next step: POST /api/v1/knowledge-base/reembed-pending?projectId=% to enqueue embedding jobs', v_project_id;

END $$;
