export { LLMGateway } from './llm-gateway';
export { OpenAICompatibleProvider } from './providers/openai-compatible.provider';
export type { LLMConfig, LLMRequest, LLMResponse } from './types';

// Layer 1 Prompts
export {
  buildRequirementExtractionPrompt,
} from './prompts/layer1/requirement-extraction.prompt';
export type {
  RequirementExtractionInput,
  ExtractedRequirement,
} from './prompts/layer1/requirement-extraction.prompt';

export {
  buildApiContractExtractionPrompt,
  buildUiPageExtractionPrompt,
  buildDbSchemaExtractionPrompt,
} from './prompts/layer1/app-model-extraction.prompt';

export {
  buildKnowledgeSearchPrompt,
} from './prompts/layer1/knowledge-search.prompt';
export type { KnowledgeSearchInput, KnowledgeSearchResult } from './prompts/layer1/knowledge-search.prompt';

// Layer 3 Prompts
export { buildTestCaseGenerationPrompt } from './prompts/layer3/generate-test-cases.prompt';
export { buildScriptGenerationPrompt } from './prompts/layer3/generate-script.prompt';
