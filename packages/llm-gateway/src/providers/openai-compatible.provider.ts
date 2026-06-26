import { LLMConfig, LLMRequest, LLMResponse } from '../types';

/**
 * OpenAI-Compatible Provider
 *
 * Talks to any gateway that implements the OpenAI REST API contract:
 *   POST {apiEndpoint}/chat/completions  — text generation
 *   POST {apiEndpoint}/embeddings        — vector embeddings
 *
 * This covers:
 *   - Baxter AI Hub  (https://aihub-test-llm-gateway.aws.baxter.com/v1)
 *   - OpenAI         (https://api.openai.com/v1)
 *   - Azure OpenAI   (https://<resource>.openai.azure.com/openai/deployments/<model>)
 *   - Ollama         (http://localhost:11434/v1)
 *   - Any LiteLLM / vLLM proxy
 *
 * Authentication: Authorization: Bearer <apiKey>
 */
export class OpenAICompatibleProvider {
  private config: LLMConfig;
  /** Base URL — trailing slash stripped once at construction time */
  private baseUrl: string;

  constructor(config: LLMConfig) {
    this.config = config;
    this.baseUrl = config.apiEndpoint.replace(/\/$/, '');
  }

  // ── Text Generation ─────────────────────────────────────────────────

  async complete(request: LLMRequest): Promise<Omit<LLMResponse, 'latencyMs'>> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: this.config.modelName,
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.1,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user',   content: request.userPrompt   },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM gateway error ${res.status}: ${text.slice(0, 400)}`);
    }

    const json = await res.json() as any;
    return {
      content: json.choices?.[0]?.message?.content ?? '',
      model:   json.model ?? this.config.modelName,
      usage: {
        inputTokens:  json.usage?.prompt_tokens     ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  // ── Embeddings ──────────────────────────────────────────────────────

  /**
   * Embeds a single piece of text and returns a float vector.
   * Uses the same model as generation by default; pass an explicit
   * embeddingModel to override (e.g. "text-embedding-ada-002").
   */
  async embed(text: string, embeddingModel?: string): Promise<number[]> {
    const url = `${this.baseUrl}/embeddings`;

    const body = {
      model: embeddingModel ?? this.config.modelName,
      input: text.slice(0, 8000),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text2 = await res.text().catch(() => '');
      throw new Error(`Embedding gateway error ${res.status}: ${text2.slice(0, 400)}`);
    }

    const json = await res.json() as any;
    const embedding: number[] = json.data?.[0]?.embedding;

    if (!embedding?.length) {
      throw new Error('Gateway returned no embedding vector');
    }
    return embedding;
  }

  // ── Internal helpers ────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }
}
