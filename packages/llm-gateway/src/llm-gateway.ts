import { OpenAICompatibleProvider } from './providers/openai-compatible.provider';
import { LLMConfig, LLMRequest, LLMResponse } from './types';

/**
 * LLM Gateway
 * Central entry point for all LLM calls across all 6 layers.
 * Talks to any OpenAI-compatible gateway (Baxter AI Hub, OpenAI, Azure, Ollama, etc.).
 * Users provide their own endpoint, Bearer API key, and model name per project.
 * The gateway handles routing, retries, and token tracking.
 */
export class LLMGateway {
  private provider: OpenAICompatibleProvider;

  constructor(config: LLMConfig) {
    this.provider = new OpenAICompatibleProvider(config);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();

    try {
      const response = await this.provider.complete(request);
      return { ...response, latencyMs: Date.now() - start };
    } catch (error) {
      throw new Error(`LLM Gateway error: ${(error as Error).message}`);
    }
  }

  async completeWithRetry(request: LLMRequest, maxRetries = 3): Promise<LLMResponse> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.complete(request);
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt)); // exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Embed a piece of text and return a float vector.
   * Delegates to the OpenAI-compatible /embeddings endpoint.
   * _llmConfig is accepted for call-site consistency but unused
   * (the provider already holds the config from construction).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async embed(text: string, _llmConfig?: LLMConfig): Promise<number[]> {
    return this.provider.embed(text);
  }

  async completeJSON<T = unknown>(request: LLMRequest): Promise<T> {
    const response = await this.completeWithRetry({
      ...request,
      responseFormat: 'json',
    });

    try {
      // Extract JSON from response (handles markdown code blocks)
      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
                        response.content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
      return JSON.parse(jsonStr) as T;
    } catch {
      throw new Error(`LLM returned invalid JSON: ${response.content.substring(0, 200)}`);
    }
  }
}
