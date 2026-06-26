-- ============================================================
-- Seed 002: Layer 1 — Default Input/Output Templates & Sample I/O Pairs
-- These are org-level defaults inserted for the first org in the system.
-- ============================================================

-- ── Helper: insert only if org exists ─────────────────────────────────
DO $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the first org and user (created during registration)
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user_id FROM users ORDER BY created_at LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organizations found — skipping Layer 1 seed. Run after first user registers.';
    RETURN;
  END IF;

  -- ── 1A. Input Template ──────────────────────────────────────────────
  INSERT INTO input_templates (org_id, name, description, schema, created_by)
  VALUES (
    v_org_id,
    'Standard Requirement Template',
    'Default structured requirement input schema used for test case generation',
    '{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "required": ["title", "description", "acceptanceCriteria"],
      "properties": {
        "title": {
          "type": "string",
          "description": "Short, clear requirement title",
          "maxLength": 255
        },
        "description": {
          "type": "string",
          "description": "Detailed description of the requirement"
        },
        "acceptanceCriteria": {
          "type": "array",
          "description": "List of acceptance criteria (Given/When/Then or plain text)",
          "items": { "type": "string" },
          "minItems": 1
        },
        "priority": {
          "type": "string",
          "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
          "default": "MEDIUM"
        },
        "source": {
          "type": "string",
          "enum": ["JIRA", "MANUAL", "SPEC", "CSV", "FILE"],
          "default": "MANUAL"
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        },
        "businessRules": {
          "type": "array",
          "description": "Specific business rules or constraints",
          "items": { "type": "string" }
        }
      }
    }'::jsonb,
    v_user_id
  )
  ON CONFLICT (org_id, name) DO NOTHING;

  -- ── 1B. Output Template ─────────────────────────────────────────────
  INSERT INTO output_templates (org_id, name, description, schema, example, created_by)
  VALUES (
    v_org_id,
    'Standard Test Case Template',
    'Default test case output schema used to instruct the LLM and validate generated test cases',
    '{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "required": ["title", "description", "preconditions", "steps", "expectedResults", "priority"],
      "properties": {
        "title": {
          "type": "string",
          "description": "Concise, action-oriented test case title",
          "maxLength": 500
        },
        "description": {
          "type": "string",
          "description": "What this test case verifies and why"
        },
        "preconditions": {
          "type": "array",
          "description": "Conditions that must be true before the test starts",
          "items": { "type": "string" }
        },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["order", "action", "expectedOutcome"],
            "properties": {
              "order": { "type": "integer" },
              "action": { "type": "string", "description": "What the tester/system does" },
              "expectedOutcome": { "type": "string", "description": "What should happen after this action" }
            }
          },
          "minItems": 1
        },
        "expectedResults": {
          "type": "array",
          "description": "Overall expected results of the test",
          "items": { "type": "string" }
        },
        "postconditions": {
          "type": "array",
          "description": "State of the system after the test completes",
          "items": { "type": "string" }
        },
        "priority": {
          "type": "string",
          "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        },
        "technique": {
          "type": "string",
          "description": "Test design technique applied"
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }'::jsonb,
    '{
      "title": "Verify successful login with valid credentials",
      "description": "Ensures that a registered user can log in using correct email and password",
      "preconditions": [
        "User account exists with email: test@example.com",
        "User is on the login page"
      ],
      "steps": [
        { "order": 1, "action": "Enter email: test@example.com in the Email field", "expectedOutcome": "Email field shows the entered email" },
        { "order": 2, "action": "Enter password: ValidPass123 in the Password field", "expectedOutcome": "Password field shows masked characters" },
        { "order": 3, "action": "Click the Login button", "expectedOutcome": "User is redirected to the dashboard" }
      ],
      "expectedResults": [
        "User is successfully authenticated",
        "User is redirected to /dashboard",
        "User name is shown in the top navigation"
      ],
      "postconditions": ["User session is active", "JWT token is stored in browser"],
      "priority": "CRITICAL",
      "technique": "Use Case Testing",
      "tags": ["authentication", "login", "happy-path"]
    }'::jsonb,
    v_user_id
  )
  ON CONFLICT (org_id, name) DO NOTHING;

  -- ── 1D. Sample I/O Pairs ─────────────────────────────────────────────

  -- Authentication Example
  INSERT INTO sample_io_pairs (org_id, title, description, category, input_example, output_example, tags, created_by)
  VALUES (
    v_org_id,
    'User Login — Happy Path',
    'Example of generating a login test case using Equivalence Partitioning',
    'AUTHENTICATION',
    '{
      "title": "User Login with valid credentials",
      "description": "Registered users must be able to log into the application using their email and password",
      "acceptanceCriteria": [
        "Given a registered user exists",
        "When the user enters valid email and password",
        "Then the user is redirected to the dashboard"
      ],
      "priority": "CRITICAL",
      "source": "MANUAL"
    }'::jsonb,
    '{
      "title": "Verify successful login with valid credentials",
      "description": "Ensures authenticated users can access the system with correct credentials",
      "preconditions": ["User account exists", "User is on the login page"],
      "steps": [
        { "order": 1, "action": "Navigate to /login", "expectedOutcome": "Login page is displayed" },
        { "order": 2, "action": "Enter valid email in Email field", "expectedOutcome": "Email is entered" },
        { "order": 3, "action": "Enter valid password in Password field", "expectedOutcome": "Password is masked" },
        { "order": 4, "action": "Click Login button", "expectedOutcome": "User is redirected to /dashboard" }
      ],
      "expectedResults": ["User is logged in", "Dashboard is displayed", "User name visible in nav"],
      "postconditions": ["Active user session exists"],
      "priority": "CRITICAL",
      "technique": "Use Case Testing",
      "tags": ["auth", "login", "happy-path"]
    }'::jsonb,
    '["authentication", "login"]'::jsonb,
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  -- CRUD API Example
  INSERT INTO sample_io_pairs (org_id, title, description, category, input_example, output_example, tags, created_by)
  VALUES (
    v_org_id,
    'Create Product API — Boundary Values',
    'Example of generating CRUD API test cases using Boundary Value Analysis',
    'CRUD_API',
    '{
      "title": "Create Product via REST API",
      "description": "The POST /api/products endpoint must create a new product with name (1-255 chars), price (0.01-99999.99), and stock (0-10000)",
      "acceptanceCriteria": [
        "Given a valid product payload",
        "When POST /api/products is called with auth token",
        "Then a 201 response with the created product is returned"
      ],
      "priority": "HIGH",
      "source": "SPEC",
      "businessRules": ["Product name must be unique", "Price cannot be negative", "Stock cannot exceed 10000"]
    }'::jsonb,
    '{
      "title": "Verify product creation at minimum boundary values",
      "description": "Tests the API with minimum valid values for all fields",
      "preconditions": ["Auth token is available", "No product named A exists"],
      "steps": [
        { "order": 1, "action": "Send POST /api/products with body: {name: A, price: 0.01, stock: 0}", "expectedOutcome": "201 Created response" },
        { "order": 2, "action": "Verify response body contains id, name: A, price: 0.01, stock: 0", "expectedOutcome": "All fields match input" }
      ],
      "expectedResults": ["Product is created in database", "Response status is 201", "Location header is set"],
      "postconditions": ["Product exists in database"],
      "priority": "HIGH",
      "technique": "Boundary Value Analysis",
      "tags": ["api", "crud", "boundary", "product"]
    }'::jsonb,
    '["api", "crud", "boundary-value"]'::jsonb,
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  -- File Processing Example
  INSERT INTO sample_io_pairs (org_id, title, description, category, input_example, output_example, tags, created_by)
  VALUES (
    v_org_id,
    'File Upload Validation',
    'Example of generating file processing test cases using Decision Tables',
    'FILE_PROCESSING',
    '{
      "title": "Document Upload Feature",
      "description": "Users can upload PDF and DOCX files up to 10MB. Files are scanned for malware before processing.",
      "acceptanceCriteria": [
        "Accept: PDF files up to 10MB",
        "Accept: DOCX files up to 10MB",
        "Reject: Files over 10MB with error message",
        "Reject: Unsupported file types with error message",
        "Reject: Files containing malware"
      ],
      "priority": "HIGH",
      "source": "SPEC"
    }'::jsonb,
    '{
      "title": "Verify file upload rejection for oversized files",
      "description": "Tests that files exceeding the 10MB limit are properly rejected",
      "preconditions": ["User is authenticated", "User is on the upload page"],
      "steps": [
        { "order": 1, "action": "Select a PDF file of 11MB", "expectedOutcome": "File is selected" },
        { "order": 2, "action": "Click Upload button", "expectedOutcome": "Error message is displayed" },
        { "order": 3, "action": "Verify error message text", "expectedOutcome": "Message says File size exceeds 10MB limit" }
      ],
      "expectedResults": ["Upload is rejected", "Error message is shown to user", "No file is stored on server"],
      "postconditions": ["No new file exists in storage"],
      "priority": "HIGH",
      "technique": "Decision Tables",
      "tags": ["file-upload", "validation", "error-handling"]
    }'::jsonb,
    '["file-processing", "upload", "validation"]'::jsonb,
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Layer 1 seed data inserted for org %', v_org_id;
END $$;
