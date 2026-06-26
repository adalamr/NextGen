import { Job } from 'bullmq';
import { logger } from '../../utils/logger';
import { getPool } from '../../config/database.config';
import { LLMGateway } from '@platform/llm-gateway';

export interface TechniqueAnalysisJobData {
  projectId: string;
  requirementId: string;
  requirementText: string;
  llmConfig: {
    apiEndpoint: string;
    apiKey: string;
    modelName: string;
    region?: string;
  };
}

/**
 * Layer 2 — Technique Analysis Processor
 *
 * Runs LLM-powered technique recommendation + risk assessment for a single
 * requirement and persists the risk assessment back to the DB.
 */
export async function techniqueProcessor(job: Job<TechniqueAnalysisJobData>) {
  const { projectId, requirementId, requirementText, llmConfig } = job.data;
  const pool = getPool();

  logger.info(`Technique analysis: requirement=${requirementId}, project=${projectId}`);
  await job.updateProgress(10);

  const gateway = new LLMGateway(llmConfig);

  // ── Step 1: Technique recommendation ─────────────────────────────────
  const techniquesResult = await pool.query(
    `SELECT name, category, when_to_use FROM technique_library WHERE is_active = TRUE ORDER BY name`,
  );
  const techniqueContext = techniquesResult.rows
    .map((t: any) => `- ${t.name} (${t.category}): ${t.when_to_use}`)
    .join('\n');

  const recommendSystemPrompt = `You are an expert QA engineer. Recommend the top 3 test design techniques
for the requirement below from the library.

## Available Techniques
${techniqueContext}

Return JSON: { "recommended": [{"name": string, "reason": string}] }
Return ONLY valid JSON.`;

  const recommendation = await gateway.completeJSON<{
    recommended: Array<{ name: string; reason: string }>;
  }>({ systemPrompt: recommendSystemPrompt, userPrompt: `Requirement:\n${requirementText}`, config: llmConfig });

  await job.updateProgress(40);

  // ── Step 2: Risk assessment ────────────────────────────────────────────
  const riskSystemPrompt = `You are a QA risk analyst. Assess the provided requirement.
Return JSON: { "likelihood": number (0-1), "impact": number (0-1), "riskLevel": "HIGH"|"MEDIUM"|"LOW", "factors": { "complexity": string, "businessCriticality": string } }
Return ONLY valid JSON.`;

  const riskResult = await gateway.completeJSON<{
    likelihood: number;
    impact: number;
    riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    factors: Record<string, string>;
  }>({ systemPrompt: riskSystemPrompt, userPrompt: `Requirement:\n${requirementText}`, config: llmConfig });

  await job.updateProgress(70);

  // ── Step 3: Persist risk assessment ──────────────────────────────────
  await pool.query(
    `INSERT INTO risk_assessments
       (project_id, requirement_id, likelihood, impact, risk_level, factors)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (project_id, requirement_id)
     DO UPDATE SET
       likelihood = EXCLUDED.likelihood,
       impact     = EXCLUDED.impact,
       risk_level = EXCLUDED.risk_level,
       factors    = EXCLUDED.factors`,
    [
      projectId,
      requirementId,
      riskResult.likelihood,
      riskResult.impact,
      riskResult.riskLevel,
      JSON.stringify(riskResult.factors),
    ],
  );

  await job.updateProgress(100);
  logger.info(`Technique analysis complete: requirement=${requirementId}`);

  return {
    requirementId,
    recommendation: recommendation.recommended,
    risk: riskResult,
  };
}
