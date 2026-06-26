/**
 * Layer 3 - Test Case Generation Prompts
 * Injected with: Technique Library (1C), App Model (1E), Sample I/O Pairs (1D)
 */
export function buildTestCaseGenerationPrompt(context: {
  requirementText: string;
  technique: string;
  appModelSummary?: string;
  techniqueDefinition?: string;
  fewShotExamples?: string;
  count?: number;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert QA engineer specializing in test case design.
You generate comprehensive, structured test cases following industry best practices.

## Technique Playbook
${context.techniqueDefinition || 'Use appropriate test design techniques based on the requirement.'}

## Application Context
${context.appModelSummary || 'No app model provided. Infer from requirement.'}

## Output Format
Return a JSON array of test cases. Each test case must have:
- title: string
- description: string
- preconditions: string[]
- steps: Array<{ order: number, action: string, expectedOutcome: string }>
- expectedResults: string[]
- postconditions: string[]
- priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
- technique: string
- tags: string[]

Return ONLY valid JSON, no markdown, no explanation.`;

  const userPrompt = `${context.fewShotExamples ? `## Examples of Good Test Cases\n${context.fewShotExamples}\n\n` : ''}
## Requirement to Test
${context.requirementText}

## Test Design Technique
${context.technique}

Generate ${context.count || 5} comprehensive test cases covering happy path, edge cases, and error scenarios.`;

  return { systemPrompt, userPrompt };
}
