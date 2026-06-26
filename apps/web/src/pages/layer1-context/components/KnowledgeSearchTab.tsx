import React, { useState, useEffect } from 'react';
import { knowledgeBaseApi } from '../../../services/layer1.service';
import { Search, BookOpen, Database, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

interface KnowledgeSearchTabProps {
  projectId: string;
}

export default function KnowledgeSearchTab({ projectId }: KnowledgeSearchTabProps) {
  const [query, setQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState('');

  const [stats, setStats] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsPage, setDocsPage] = useState(1);
  const [docsTotal, setDocsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    loadDocuments();
  }, [projectId, docsPage, docTypeFilter]);

  const loadStats = async () => {
    try {
      const res = await knowledgeBaseApi.stats(projectId);
      setStats(res.data.data);
    } catch { /* silent */ }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await knowledgeBaseApi.list(projectId, {
        page: docsPage,
        limit: 10,
        docType: docTypeFilter || undefined,
      });
      setDocuments(res.data.documents);
      setDocsTotal(res.data.total);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true); setSearchError(''); setSearchResult(null);
    try {
      const res = await knowledgeBaseApi.search(projectId, query, { topK: 10 });
      setSearchResult(res.data.data);
    } catch (e: any) {
      setSearchError(e.response?.data?.message || 'Search failed. Ensure LLM config is set in Project Settings.');
    } finally { setSearching(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this chunk from the knowledge base?')) return;
    try {
      await knowledgeBaseApi.delete(id, projectId);
      loadDocuments(); loadStats();
    } catch { /* silent */ }
  };

  const CONFIDENCE_COLORS: Record<string, string> = {
    HIGH: 'text-green-600 bg-green-50',
    MEDIUM: 'text-yellow-600 bg-yellow-50',
    LOW: 'text-red-600 bg-red-50',
  };

  const DOC_TYPE_ICONS: Record<string, string> = {
    REQUIREMENT: '📋',
    DOC: '📄',
    DEFECT: '🐛',
    INCIDENT: '⚠️',
    TEST_RESULT: '✅',
    DOCUMENT: '📄',
    SWAGGER: '🔌',
    UI_SPEC: '🖥️',
    DB_SCHEMA: '🗄️',
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-500" />
            Knowledge Base Index
          </h3>
          <div className="flex flex-wrap gap-3">
            <div className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              {stats.totalChunks} total vectors
            </div>
            {Object.entries(stats.byDocType || {}).map(([type, count]: any) => (
              <div key={type} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm">
                {DOC_TYPE_ICONS[type] || '📄'} {type}: {count}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Semantic Search */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-500" />
          Semantic Knowledge Search
        </h3>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Ask anything about this project... e.g. 'What are the authentication requirements?'"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchError && (
          <div className="mt-3 text-red-600 text-sm bg-red-50 p-3 rounded-lg">{searchError}</div>
        )}

        {searchResult && (
          <div className="mt-4 space-y-4">
            {/* Answer */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-indigo-600">AI ANSWER</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_COLORS[searchResult.confidence]}`}>
                  {searchResult.confidence} confidence
                </span>
              </div>
              <p className="text-sm text-gray-800">{searchResult.answer}</p>
            </div>

            {/* Relevant Chunks */}
            {searchResult.relevantChunks?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Relevant Sources</h4>
                <div className="space-y-2">
                  {searchResult.relevantChunks.map((chunk: any, i: number) => (
                    <div key={i} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedId(expandedId === chunk.id ? null : chunk.id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                            {chunk.relevanceScore}/10
                          </span>
                          <span className="font-medium text-gray-700">{DOC_TYPE_ICONS[chunk.docType]} {chunk.docType}</span>
                          <span className="text-gray-400 text-xs">{chunk.reason}</span>
                        </div>
                        {expandedId === chunk.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                      {expandedId === chunk.id && (
                        <div className="px-4 pb-3 text-sm text-gray-600 bg-gray-50 border-t">
                          <p className="font-mono text-xs">{chunk.excerpt}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up suggestions */}
            {searchResult.suggestedFollowUps?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Suggested Follow-ups</h4>
                <div className="flex flex-wrap gap-2">
                  {searchResult.suggestedFollowUps.map((q: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => { setQuery(q); }}
                      className="text-xs px-3 py-1.5 border rounded-full hover:bg-indigo-50 hover:border-indigo-300 text-gray-600 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document Chunks */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-500" />
            Indexed Document Chunks ({docsTotal})
          </h3>
          <select
            value={docTypeFilter}
            onChange={(e) => { setDocTypeFilter(e.target.value); setDocsPage(1); }}
            className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">All Types</option>
            <option value="REQUIREMENT">REQUIREMENT</option>
            <option value="DOCUMENT">DOCUMENT</option>
            <option value="SWAGGER">SWAGGER</option>
            <option value="UI_SPEC">UI_SPEC</option>
            <option value="DB_SCHEMA">DB_SCHEMA</option>
            <option value="TEST_RESULT">TEST_RESULT</option>
            <option value="DEFECT">DEFECT</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No documents indexed yet. Upload files via Connectors to populate the knowledge base.
          </div>
        ) : (
          <div className="divide-y">
            {documents.map((doc) => (
              <div key={doc.id} className="px-4 py-3 hover:bg-gray-50 flex items-start gap-3">
                <span className="text-lg">{DOC_TYPE_ICONS[doc.docType] || '📄'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{doc.docType}</span>
                    {doc.docId && <span className="text-xs text-gray-400 font-mono">{doc.docId}</span>}
                  </div>
                  <p className="text-sm text-gray-700 mt-1 line-clamp-2">{doc.excerpt}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(doc.createdAt).toLocaleString()}</p>
                </div>
                <button onClick={() => handleDelete(doc.id)} className="text-gray-300 hover:text-red-500 transition" title="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {Math.ceil(docsTotal / 10) > 1 && (
          <div className="px-4 py-3 border-t flex justify-between items-center">
            <span className="text-sm text-gray-500">Page {docsPage} of {Math.ceil(docsTotal / 10)}</span>
            <div className="flex gap-1">
              <button onClick={() => setDocsPage(p => Math.max(1, p - 1))} disabled={docsPage === 1}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <button onClick={() => setDocsPage(p => p + 1)} disabled={docsPage >= Math.ceil(docsTotal / 10)}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
