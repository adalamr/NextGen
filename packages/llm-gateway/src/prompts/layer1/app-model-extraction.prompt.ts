/**
 * Layer 1 — App Model Extraction Prompt
 *
 * Used by the ingestion worker to auto-extract structured App Model
 * components from uploaded documents:
 *   - Swagger/OpenAPI → API contracts
 *   - HTML/DOM snapshot → UI pages & elements
 *   - SQL DDL / ERD text → DB schema graph
 *   - Plain text → best-effort extraction of any of the above
 */

// ── API Contract Extraction ───────────────────────────────────────────

export interface ApiContractExtractionInput {
  rawContent: string;             // Swagger JSON/YAML or plain text describing APIs
  sourceType: 'SWAGGER' | 'OPENAPI' | 'TEXT';
}

export interface ExtractedApiContract {
  endpoint: string;               // e.g. /api/users/{id}
  method: string;                 // GET | POST | PUT | PATCH | DELETE
  description: string;
  params: Record<string, unknown>;
  schemas: Record<string, unknown>;
  auth: Record<string, unknown>;
  rateLimits: Record<string, unknown>;
  version: string;
}

export function buildApiContractExtractionPrompt(
  input: ApiContractExtractionInput,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an API documentation parser AI.
Extract all REST API endpoints from the provided content.

For each endpoint return:
- endpoint: string (path with params like /users/{id})
- method: string (GET | POST | PUT | PATCH | DELETE)
- description: string (what it does)
- params: object (path params, query params, with type and required flag)
- schemas: object (request body schema and response schema)
- auth: object (authentication requirements: bearer, apiKey, etc.)
- rateLimits: object (if mentioned, else empty object)
- version: string (API version if present, else "v1")

Return ONLY a valid JSON array of endpoint objects. No markdown, no extra text.`;

  const userPrompt = `## Source Type: ${input.sourceType}

## Content:
\`\`\`
${input.rawContent.slice(0, 15000)}
\`\`\`

Extract all API endpoints and return them as a JSON array.`;

  return { systemPrompt, userPrompt };
}

// ── UI Page & Element Extraction ──────────────────────────────────────

export interface UiPageExtractionInput {
  rawContent: string;             // HTML, DOM description, or plain text about UI screens
  sourceType: 'HTML' | 'TEXT';
}

export interface ExtractedUiPage {
  name: string;                   // e.g. "Login Page"
  urlPattern: string;             // e.g. /login or /users/:id
  description: string;
  elements: Array<{
    name: string;
    locator: string;              // CSS or XPath
    type: string;                 // button | input | dropdown | link | table | form
    attributes: Record<string, string>;
  }>;
  actions: Array<{
    name: string;                 // e.g. "Submit login form"
    trigger: string;              // click | input | submit
    elementName: string;
    outcome: string;
  }>;
}

export function buildUiPageExtractionPrompt(
  input: UiPageExtractionInput,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a UI/UX test automation architect AI.
Extract UI pages and their interactive elements from the provided content.

For each page return:
- name: string (human-readable page name)
- urlPattern: string (URL path)
- description: string
- elements: array of { name, locator, type, attributes }
  - type must be one of: button | input | dropdown | link | table | form | modal | text
  - locator should be CSS selector if HTML provided, or descriptive name if text only
- actions: array of { name, trigger, elementName, outcome }

Return ONLY a valid JSON array of page objects. No markdown, no extra text.`;

  const userPrompt = `## Source Type: ${input.sourceType}

## Content:
\`\`\`
${input.rawContent.slice(0, 12000)}
\`\`\`

Extract all UI pages and their elements. Return as a JSON array.`;

  return { systemPrompt, userPrompt };
}

// ── Database Schema Extraction ────────────────────────────────────────

export interface DbSchemaExtractionInput {
  rawContent: string;             // SQL DDL, ERD description, or plain text
  sourceType: 'SQL_DDL' | 'TEXT';
}

export interface ExtractedDbTable {
  tableName: string;
  description: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    description: string;
  }>;
  relations: Array<{
    toTable: string;
    type: string;         // ONE_TO_ONE | ONE_TO_MANY | MANY_TO_MANY
    via: string;          // foreign key column name
  }>;
  constraints: string[];
  indexes: string[];
}

export function buildDbSchemaExtractionPrompt(
  input: DbSchemaExtractionInput,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a database architect AI assistant.
Extract database table definitions from the provided SQL DDL or description.

For each table return:
- tableName: string
- description: string (what data it stores)
- columns: array of { name, type, nullable, isPrimaryKey, isForeignKey, description }
- relations: array of { toTable, type (ONE_TO_ONE|ONE_TO_MANY|MANY_TO_MANY), via }
- constraints: array of constraint description strings
- indexes: array of index description strings

Return ONLY a valid JSON array of table objects. No markdown, no extra text.`;

  const userPrompt = `## Source Type: ${input.sourceType}

## Content:
\`\`\`
${input.rawContent.slice(0, 12000)}
\`\`\`

Extract all database tables and their schema. Return as a JSON array.`;

  return { systemPrompt, userPrompt };
}
