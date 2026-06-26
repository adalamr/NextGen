/**
 * Layer 1 — Requirement Extraction Prompt
 *
 * Used by the ingestion worker to convert raw unstructured text
 * (plain text paste, file content, CSV rows) into structured
 * requirements that match the org's Input Template schema.
 */

export interface RequirementExtractionInput {
  rawText: string;
  sourceType: 'FILE_UPLOAD' | 'TEXT_INPUT' | 'CSV_IMPORT';
  inputTemplateSchema: string;     // JSON Schema string from input_templates table
  existingTitles?: string[];       // avoid duplicate titles
  maxRequirements?: number;        // cap extraction
}

export interface ExtractedRequirement {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  source: string;
  tags: string[];
  businessRules: string[];
  externalId?: string;             // if a Jira ticket ID or CSV column is detected
}

export function buildRequirementExtractionPrompt(
  input: RequirementExtractionInput,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a senior business analyst AI assistant specialising in software requirements engineering.

Your job is to read raw unstructured text and extract well-formed, structured software requirements.

## Rules
- Each requirement must be atomic (tests one thing)
- Titles must be unique, concise, and action-oriented (max 255 characters)
- Accept acceptance criteria in Given/When/Then format where possible
- Infer priority from keywords: "critical", "must", "shall" → CRITICAL/HIGH; "should" → MEDIUM; "could", "nice to have" → LOW
- Detect and preserve any external IDs (e.g. JIRA-123, REQ-001, US-45)
- Do NOT invent requirements not present in the source text
- If the text is a CSV, treat each data row as a separate requirement

## Output Schema (from this organisation's Input Template)
${input.inputTemplateSchema}

Return ONLY a valid JSON array. No markdown, no explanation text outside the JSON.`;

  const existingTitlesNote = input.existingTitles?.length
    ? `\n\n## Already-Existing Requirements (avoid duplicates)\n${input.existingTitles.slice(0, 20).join('\n')}`
    : '';

  const userPrompt = `## Source Type
${input.sourceType}

## Raw Text to Extract Requirements From
\`\`\`
${input.rawText.slice(0, 12000)}
\`\`\`
${existingTitlesNote}

Extract up to ${input.maxRequirements || 20} requirements from the text above.
Return a JSON array of requirement objects matching the output schema exactly.`;

  return { systemPrompt, userPrompt };
}
