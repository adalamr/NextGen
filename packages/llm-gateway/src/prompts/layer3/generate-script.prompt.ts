/**
 * Layer 3 - Script Generation Prompts
 * Uses real locators from POM (App Model) and API contracts
 */
export function buildScriptGenerationPrompt(context: {
  testCase: Record<string, unknown>;
  framework: string;
  pageObjects?: Record<string, unknown>[];
  apiContracts?: Record<string, unknown>[];
}): { systemPrompt: string; userPrompt: string } {
  const frameworkGuides: Record<string, string> = {
    PLAYWRIGHT: 'Use Playwright with TypeScript. Use page.getByRole(), getByLabel(), getByText() for locators.',
    CYPRESS: 'Use Cypress with TypeScript. Use cy.get(), cy.contains(), cy.findByRole().',
    SELENIUM: 'Use Selenium WebDriver with Java. Use By.id(), By.xpath(), By.cssSelector().',
    REST_ASSURED: 'Use RestAssured with Java for API testing. Use given/when/then BDD style.',
    K6: 'Use k6 for performance testing. Use http.get(), http.post() with checks.',
  };

  const systemPrompt = `You are an expert test automation engineer.
You generate production-ready test scripts using real locators from the Page Object Model.

## Framework Guidelines
${frameworkGuides[context.framework] || frameworkGuides['PLAYWRIGHT']}

## Rules
- Use actual locators from the provided Page Object Model
- Include proper setup and teardown
- Add meaningful assertions
- Handle async operations correctly
- Follow the Page Object Pattern
- Return ONLY the script code, no explanation`;

  const userPrompt = `## Test Case
${JSON.stringify(context.testCase, null, 2)}

${context.pageObjects?.length ? `## Page Object Model (Real Locators)\n${JSON.stringify(context.pageObjects, null, 2)}\n` : ''}
${context.apiContracts?.length ? `## API Contracts\n${JSON.stringify(context.apiContracts, null, 2)}\n` : ''}

Generate a complete, runnable ${context.framework} test script for this test case.`;

  return { systemPrompt, userPrompt };
}
