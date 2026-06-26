/**
 * Layer 1 — Knowledge Base Search Re-Rank & Summarise Prompt
 *
 * After pgvector returns the top-K semantically similar chunks,
 * this prompt sends them to the LLM for:
 *   1. Relevance re-ranking (most relevant chunk first)
 *   2. Synthesis into a concise answer
 *   3. Source citation
 */

export interface KnowledgeSearchInput {
  query: string;
  topKChunks: Array<{
    id: string;
    content: string;
    docType: string;         // REQUIREMENT | DOC | DEFECT | INCIDENT | TEST_RESULT
    docId: string;
    similarity: number;      // cosine similarity score 0–1
    metadata: Record<string, unknown>;
  }>;
  maxResults?: number;       // default 5 — how many re-ranked results to return
}

export interface KnowledgeSearchResult {
  answer: string;                  // LLM-synthesised answer to the query
  relevantChunks: Array<{
    id: string;
    docType: string;
    docId: string;
    relevanceScore: number;        // 1–10 LLM-assigned score
    reason: string;                // why it's relevant
    excerpt: string;               // short snippet from the chunk
  }>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedFollowUps: string[];    // related questions the user might ask
}

export function buildKnowledgeSearchPrompt(
  input: KnowledgeSearchInput,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a knowledge base AI assistant for a software testing platform.

You receive a user query and a set of candidate text chunks retrieved via semantic vector search.
Your tasks:
1. Re-rank the chunks by true relevance to the query (vector similarity can miss context)
2. Synthesise a concise, accurate answer (2-5 sentences) based only on the provided chunks
3. Score each chunk's relevance 1–10
4. Suggest 2-3 follow-up questions

## Rules
- Base your answer ONLY on the provided chunks — do not invent information
- If no chunk is relevant, say "No relevant information found in the knowledge base"
- Relevance score: 8-10 = directly answers query, 5-7 = partially relevant, 1-4 = marginally related
- confidence: HIGH if top chunk score ≥ 8, MEDIUM if ≥ 5, LOW otherwise

## Output JSON Structure
{
  "answer": "...",
  "relevantChunks": [
    { "id": "...", "docType": "...", "docId": "...", "relevanceScore": 9, "reason": "...", "excerpt": "..." }
  ],
  "confidence": "HIGH|MEDIUM|LOW",
  "suggestedFollowUps": ["...", "..."]
}

Return ONLY valid JSON matching the structure above.`;

  const chunksText = input.topKChunks
    .slice(0, 10)  // hard cap — avoid token overflow
    .map((c, i) => `[CHUNK ${i + 1}]
ID: ${c.id}
DocType: ${c.docType} | DocID: ${c.docId}
Vector Similarity: ${c.similarity.toFixed(3)}
Content: ${c.content.slice(0, 800)}`)
    .join('\n\n---\n\n');

  const userPrompt = `## User Query
"${input.query}"

## Retrieved Chunks (${input.topKChunks.length} results from vector search)
${chunksText}

Re-rank, synthesise an answer, and return the JSON structure described in your instructions.
Return top ${input.maxResults || 5} most relevant chunks only.`;

  return { systemPrompt, userPrompt };
}
