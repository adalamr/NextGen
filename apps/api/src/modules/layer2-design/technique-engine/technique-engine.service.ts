import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import {
  LLMGateway,
  buildTestCaseGenerationPrompt,
} from '@platform/llm-gateway';

/**
 * Layer 2 — Technique Engine Service
 *
 * Manages the technique library and provides LLM-powered technique selection
 * based on requirement characteristics.
 */
export class TechniqueEngineService {

  // ── LIST TECHNIQUES ───────────────────────────────────────────────────
  async listTechniques(filters: { category?: string; search?: string } = {}) {
    const pool = getPool();
    const conditions: string[] = ['is_active = TRUE'];
    const params: unknown[] = [];

    if (filters.category) {
      params.push(filters.category);
      conditions.push(`category = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    const result = await pool.query(
      `SELECT id, name, category, description, when_to_use, examples, is_active, created_at
       FROM technique_library
       WHERE ${conditions.join(' AND ')}
       ORDER BY category, name`,
      params,
    );
    return result.rows.map(this.mapTechnique);
  }

  // ── GET SINGLE TECHNIQUE ──────────────────────────────────────────────
  async getTechnique(id: string) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM technique_library WHERE id = $1',
      [id],
    );
    if (!result.rows.length) throw new ApiError(404, 'Technique not found');
    return this.mapTechnique(result.rows[0]);
  }

  // ── RECOMMEND TECHNIQUE (LLM-powered) ────────────────────────────────
  // Analyses a requirement and recommends the most appropriate techniques
  // from the library.  Falls back to a heuristic ranking when llmConfig
  // is not supplied.
  async recommendTechniques(
    projectId: string,
    requirementText: string,
    llmConfig?: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
    topK = 3,
  ) {
    const pool = getPool();

    // Load full library for context
    const allTechniques = await this.listTechniques();

    if (!llmConfig) {
      // Heuristic fallback: return top-K by name order
      return {
        recommended: allTechniques.slice(0, topK),
        reasoning: 'No LLM config provided — returning default techniques.',
      };
    }

    const gateway = new LLMGateway(llmConfig);
    const techniqueContext = allTechniques
      .map((t) => `- ${t.name} (${t.category}): ${t.whenToUse}`)
      .join('\n');

    const systemPrompt = `You are an expert QA engineer specialising in test design technique selection.
Given a requirement, analyse it and recommend the best test design techniques from the provided library.

## Available Techniques
${techniqueContext}

Return JSON: { "recommended": [{"name": string, "reason": string}], "reasoning": string }
Return ONLY valid JSON.`;

    const userPrompt = `## Requirement
${requirementText}

Recommend the top ${topK} most appropriate test design techniques from the library above.`;

    const result = await gateway.completeJSON<{
      recommended: Array<{ name: string; reason: string }>;
      reasoning: string;
    }>({ systemPrompt, userPrompt, config: llmConfig });

    // Enrich with full technique objects
    const enriched = result.recommended
      .map((r) => {
        const found = allTechniques.find(
          (t) => t.name.toLowerCase() === r.name.toLowerCase(),
        );
        return found ? { ...found, llmReason: r.reason } : null;
      })
      .filter(Boolean);

    return { recommended: enriched, reasoning: result.reasoning };
  }

  // ── ANALYSE REQUIREMENT ───────────────────────────────────────────────
  // Returns a risk profile + recommended technique for a given requirement.
  async analyseRequirement(
    projectId: string,
    requirementText: string,
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
  ) {
    const gateway = new LLMGateway(llmConfig);

    const systemPrompt = `You are a QA analyst. Analyse the provided requirement and return a JSON object with:
{
  "complexity": "LOW" | "MEDIUM" | "HIGH",
  "riskAreas": string[],
  "suggestedTechniques": string[],
  "estimatedTestCount": number,
  "notes": string
}
Return ONLY valid JSON.`;

    const userPrompt = `Requirement:\n${requirementText}`;

    return await gateway.completeJSON<{
      complexity: 'LOW' | 'MEDIUM' | 'HIGH';
      riskAreas: string[];
      suggestedTechniques: string[];
      estimatedTestCount: number;
      notes: string;
    }>({ systemPrompt, userPrompt, config: llmConfig });
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapTechnique(row: any) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      whenToUse: row.when_to_use,
      examples: row.examples ?? [],
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }
}
