import React, { useState, useEffect } from 'react';
import { templatesApi } from '../../../services/layer1.service';
import { Plus, Star, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';

interface TemplatesTabProps {
  projectId: string;
}

type SubTab = 'input' | 'output' | 'samples' | 'feedback';

export default function TemplatesTab({ projectId }: TemplatesTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('samples');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [inputTemplates, setInputTemplates] = useState<any[]>([]);
  const [outputTemplates, setOutputTemplates] = useState<any[]>([]);
  const [samplePairs, setSamplePairs] = useState<any[]>([]);
  const [goldStandards, setGoldStandards] = useState<any[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({
    title: '', description: '', category: 'API', inputExample: '{}', outputExample: '{}',
    name: '', schema: '{}', example: '{}'
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, [subTab, projectId]);

  const loadData = async () => {
    setLoading(true); setError('');
    try {
      if (subTab === 'input') {
        const res = await templatesApi.getInputTemplates();
        setInputTemplates(res.data.data);
      } else if (subTab === 'output') {
        const res = await templatesApi.getOutputTemplates();
        setOutputTemplates(res.data.data);
      } else if (subTab === 'samples') {
        const res = await templatesApi.getSamplePairs();
        setSamplePairs(res.data.pairs);
      } else {
        const res = await templatesApi.getGoldStandards(projectId);
        setGoldStandards(res.data.data);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load');
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      if (subTab === 'input') {
        if (!addForm.name) { setError('Name is required'); return; }
        let schema: unknown;
        try { schema = JSON.parse(addForm.schema); } catch { setError('Schema must be valid JSON'); return; }
        await templatesApi.createInputTemplate({ name: addForm.name, description: addForm.description, schema });
      } else if (subTab === 'output') {
        if (!addForm.name) { setError('Name is required'); return; }
        let schema: unknown; let example: unknown = {};
        try { schema = JSON.parse(addForm.schema); } catch { setError('Schema must be valid JSON'); return; }
        try { example = JSON.parse(addForm.example || '{}'); } catch { /* ignore */ }
        await templatesApi.createOutputTemplate({ name: addForm.name, description: addForm.description, schema, example });
      } else if (subTab === 'samples') {
        if (!addForm.title) { setError('Title is required'); return; }
        let inputExample: unknown; let outputExample: unknown;
        try { inputExample = JSON.parse(addForm.inputExample); } catch { setError('Input Example must be valid JSON'); return; }
        try { outputExample = JSON.parse(addForm.outputExample); } catch { setError('Output Example must be valid JSON'); return; }
        await templatesApi.createSamplePair({ title: addForm.title, description: addForm.description, category: addForm.category, inputExample, outputExample });
      }
      setShowAdd(false);
      loadData();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (id: string, isActive: boolean, type: 'input' | 'output') => {
    try {
      if (type === 'input') await templatesApi.updateInputTemplate(id, { isActive: !isActive });
      else await templatesApi.updateOutputTemplate(id, { isActive: !isActive });
      loadData();
    } catch { /* silent */ }
  };

  const handleDeleteSample = async (id: string) => {
    if (!confirm('Remove this sample pair?')) return;
    try { await templatesApi.deleteSamplePair(id); loadData(); } catch { /* silent */ }
  };

  const SUB_TABS = [
    { key: 'samples' as SubTab, label: '📋 Sample I/O Pairs' },
    { key: 'input' as SubTab, label: '📥 Input Templates' },
    { key: 'output' as SubTab, label: '📤 Output Templates' },
    { key: 'feedback' as SubTab, label: '⭐ Gold Standards' },
  ];

  const CATEGORY_COLORS: Record<string, string> = {
    API: 'bg-blue-100 text-blue-700',
    UI: 'bg-purple-100 text-purple-700',
    DB: 'bg-yellow-100 text-yellow-700',
    SECURITY: 'bg-red-100 text-red-700',
    PERFORMANCE: 'bg-orange-100 text-orange-700',
    INTEGRATION: 'bg-green-100 text-green-700',
    GENERAL: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-0 border-b">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition
              ${subTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      {subTab !== 'feedback' && (
        <div className="flex justify-end">
          <button onClick={() => { setShowAdd(true); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" />
            Add {subTab === 'samples' ? 'Sample Pair' : subTab === 'input' ? 'Input Template' : 'Output Template'}
          </button>
        </div>
      )}

      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          {/* Sample I/O Pairs */}
          {subTab === 'samples' && (
            samplePairs.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No sample pairs yet. Add examples to improve AI test generation quality.
              </div>
            ) : (
              <div className="space-y-2">
                {samplePairs.map((pair) => (
                  <div key={pair.id} className="bg-white border rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedId(expandedId === pair.id ? null : pair.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[pair.category] || 'bg-gray-100 text-gray-600'}`}>
                          {pair.category}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{pair.title}</span>
                        {pair.description && <span className="text-xs text-gray-400">{pair.description}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSample(pair.id); }}
                          className="text-gray-300 hover:text-red-500 text-xs px-2 py-1 rounded transition">Remove</button>
                        {expandedId === pair.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {expandedId === pair.id && (
                      <div className="border-t p-4 grid grid-cols-2 gap-4 bg-gray-50">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2">📥 INPUT (Requirement)</p>
                          <pre className="text-xs bg-white border rounded p-3 overflow-auto max-h-48 font-mono text-gray-700">
                            {JSON.stringify(pair.inputExample, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2">📤 OUTPUT (Test Case)</p>
                          <pre className="text-xs bg-white border rounded p-3 overflow-auto max-h-48 font-mono text-gray-700">
                            {JSON.stringify(pair.outputExample, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* Input Templates */}
          {subTab === 'input' && (
            inputTemplates.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No input templates. Define the JSON schema that requirements must follow.</div>
            ) : (
              <div className="space-y-2">
                {inputTemplates.map((t) => (
                  <div key={t.id} className="bg-white border rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{t.name}</span>
                          {t.isActive && <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">Active</span>}
                        </div>
                        {t.description && <p className="text-sm text-gray-500 mt-1">{t.description}</p>}
                      </div>
                      <button onClick={() => handleToggleActive(t.id, t.isActive, 'input')}
                        className="text-xs flex items-center gap-1 border rounded px-2 py-1 hover:bg-gray-50 transition">
                        {t.isActive ? <><EyeOff className="w-3 h-3" /> Deactivate</> : <><Eye className="w-3 h-3" /> Activate</>}
                      </button>
                    </div>
                    <pre className="mt-3 text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-40 font-mono text-gray-600">
                      {JSON.stringify(t.schema, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Output Templates */}
          {subTab === 'output' && (
            outputTemplates.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No output templates. Define the JSON schema for AI-generated test cases.</div>
            ) : (
              <div className="space-y-2">
                {outputTemplates.map((t) => (
                  <div key={t.id} className="bg-white border rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{t.name}</span>
                          {t.isActive && <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">Active</span>}
                        </div>
                        {t.description && <p className="text-sm text-gray-500 mt-1">{t.description}</p>}
                      </div>
                      <button onClick={() => handleToggleActive(t.id, t.isActive, 'output')}
                        className="text-xs flex items-center gap-1 border rounded px-2 py-1 hover:bg-gray-50 transition">
                        {t.isActive ? <><EyeOff className="w-3 h-3" /> Deactivate</> : <><Eye className="w-3 h-3" /> Activate</>}
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Schema</p>
                        <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-32 font-mono text-gray-600">
                          {JSON.stringify(t.schema, null, 2)}
                        </pre>
                      </div>
                      {t.example && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Example</p>
                          <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-32 font-mono text-gray-600">
                            {JSON.stringify(t.example, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Gold Standards */}
          {subTab === 'feedback' && (
            goldStandards.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <Star className="w-8 h-8 mx-auto mb-2 text-yellow-300" />
                No gold standard test cases yet. Review AI-generated test cases and rate them ≥80% match to mark as gold standards.
              </div>
            ) : (
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Test Case</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Technique</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Match %</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Approved By</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {goldStandards.map((gs: any) => (
                      <tr key={gs.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800 flex items-center gap-2">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                            {gs.title}
                          </div>
                          {gs.feedback_notes && <p className="text-xs text-gray-500 mt-0.5">{gs.feedback_notes}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{gs.technique}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${gs.match_percentage >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                            {gs.match_percentage}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{gs.gold_standard_by_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {gs.gold_standard_at ? new Date(gs.gold_standard_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">
                {subTab === 'samples' ? 'Add Sample I/O Pair' : subTab === 'input' ? 'Create Input Template' : 'Create Output Template'}
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-4">
              {subTab === 'samples' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Title *">
                      <input value={addForm.title} onChange={e => setAddForm({ ...addForm, title: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="e.g. Login with valid credentials" />
                    </Field>
                    <Field label="Category *">
                      <select value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        {['API', 'UI', 'DB', 'SECURITY', 'PERFORMANCE', 'INTEGRATION', 'GENERAL'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Description">
                    <input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="Brief description..." />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Input Example (JSON) *">
                      <textarea value={addForm.inputExample} onChange={e => setAddForm({ ...addForm, inputExample: e.target.value })}
                        rows={8} className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder='{"title": "User can log in", "priority": "HIGH"}' />
                    </Field>
                    <Field label="Output Example (JSON) *">
                      <textarea value={addForm.outputExample} onChange={e => setAddForm({ ...addForm, outputExample: e.target.value })}
                        rows={8} className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder='{"title": "TC-001", "steps": [...]}' />
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Name *">
                    <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </Field>
                  <Field label="Description">
                    <input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </Field>
                  <Field label="Schema (JSON) *">
                    <textarea value={addForm.schema} onChange={e => setAddForm({ ...addForm, schema: e.target.value })}
                      rows={8} className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </Field>
                  {subTab === 'output' && (
                    <Field label="Example Output (JSON)">
                      <textarea value={addForm.example} onChange={e => setAddForm({ ...addForm, example: e.target.value })}
                        rows={5} className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </Field>
                  )}
                </>
              )}
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
