/**
 * Layer 5 - Self-Healing Prompts
 * Detects UI changes and proposes new locators from App Model
 */
export function buildSelfHealingPrompt(context: {
  brokenLocator: string;
  errorMessage: string;
  currentPageElements: Record<string, unknown>[];
  originalElement?: Record<string, unknown>;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert in test automation and UI element locator strategies.
When a test locator breaks due to UI changes, you analyze the current page structure
and propose the best replacement locator from the available elements.

## Rules
- Prefer stable locators: data-testid > aria-label > role > text > CSS > XPath
- Explain WHY the new locator is better
- Return JSON: { proposedLocator: string, confidence: number (0-1), reason: string }`;

  const userPrompt = `## Broken Locator
${context.brokenLocator}

## Error Message
${context.errorMessage}

${context.originalElement ? `## Original Element Context\n${JSON.stringify(context.originalElement, null, 2)}\n` : ''}
## Current Page Elements (from App Model)
${JSON.stringify(context.currentPageElements, null, 2)}

Propose the best replacement locator.`;

  return { systemPrompt, userPrompt };
}
