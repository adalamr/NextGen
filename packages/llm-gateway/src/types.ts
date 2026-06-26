export interface LLMConfig {
  /**
   * Base URL of the OpenAI-compatible gateway, e.g.
   * https://aihub-test-llm-gateway.aws.baxter.com/v1
   * The provider appends /chat/completions and /embeddings automatically.
   */
  apiEndpoint: string;
  /** Bearer token sent as: Authorization: Bearer <apiKey> */
  apiKey: string;
  /** Model identifier, e.g. claude-sonnet-4.6 */
  modelName: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  config: LLMConfig;
  responseFormat?: 'json' | 'text';
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
}
