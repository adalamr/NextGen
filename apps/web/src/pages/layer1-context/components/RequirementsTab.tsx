import React, { useState, useEffect, useCallback } from 'react';
import { requirementsApi } from '../../../services/layer1.service';
import { Plus, Search, Upload, Trash2, Edit2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface Requirement {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  source: string;
  externalId?: string;
  testCaseCount?: number;
  coverageStatus?: string;
  createdAt: string;
}

interface RequirementsTabProps {
  projectId: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-gray-100 text-gray-600',
};

const COVERAGE_COLORS: Record<string, string> = {
  COVERED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  NOT_COVERED: 'bg-red-100 text-red-600',
};

export default function RequirementsTab({ projectId }: RequirementsTabProps) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 15;

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', source: 'MANUAL', externalId: '' });
  const [importText, setImportText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, statsRes] = await Promise.all([
        requirementsApi.list(projectId, { page, limit: LIMIT, search: search || undefined, priority: priorityFilter || undefined }),
        requirementsApi.stats(projectId),
      ]);
      setRequirements(reqRes.data.requirements);
      setTotal(reqRes.data.total);
      setStats(statsRes.data.data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load requirements');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, search, priorityFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      await requirementsApi.create(projectId, form);
      setShowCreate(false);
      setForm({ title: '', description: '', priority: 'MEDIUM', source: 'MANUAL', externalId: '' });
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create requirement');
    } finally { setSaving(false); }
  };

  const handleImport = async () => {
    if (!importText.trim()) { setError('Enter CSV or plain text'); return; }
    setSaving(true); setError('');
    try {
      // Parse CSV rows into requirement objects
      const lines = importText.trim().split('\n').filter(Boolean);
      const requirements = lines.map((line) => {
        const cols = line.split(',');
        return {
          title: cols[0]?.trim(),
          description: cols[1]?.trim() || '',
          priority: cols[2]?.trim().toUpperCase() || 'MEDIUM',
          source: 'CSV',
          externalId: cols[3]?.trim() || undefined,
        };
      });
      const res = await requirementsApi.bulkImport(projectId, requirements);
      setShowImport(false);
      setImportText('');
      alert(`Imported ${res.data.data.inserted} requirements (${res.data.data.skipped} skipped as duplicates)`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Import failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this requirement?')) return;
    try {
      await requirementsApi.delete(id, projectId);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Delete failed');
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.total} color="blue" />
          <StatCard label="Covered" value={stats.byCoverage?.COVERED || 0} color="green" />
          <StatCard label="Partial" value={stats.byCoverage?.PARTIAL || 0} color="yellow" />
          <StatCard label="Not Covered" value={stats.byCoverage?.NOT_COVERED || 0} color="red" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search requirements..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 pr-3 py-2 border rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <button
          onClick={() => { setShowImport(true); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 transition"
        >
          <Upload className="w-4 h-4" /> Import CSV
        </button>
        <button
          onClick={() => { setShowCreate(true); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4" /> Add Requirement
        </button>
        <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-500' : 'text-gray-500'}`} />
        </button>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Priority</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Coverage</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Tests</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Source</th>
              <th className="w-16 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
            )}
            {!loading && requirements.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  No requirements yet. Add one or import from CSV.
                </td>
              </tr>
            )}
            {requirements.map((req) => (
              <tr key={req.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{req.title}</div>
                  {req.description && (
                    <div className="text-gray-500 text-xs mt-0.5 truncate max-w-sm">{req.description}</div>
                  )}
                  {req.externalId && (
                    <span className="text-xs text-indigo-500 font-mono">{req.externalId}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[req.priority] || 'bg-gray-100 text-gray-600'}`}>
                    {req.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COVERAGE_COLORS[req.coverageStatus || 'NOT_COVERED']}`}>
                    {req.coverageStatus || 'NOT_COVERED'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{req.testCaseCount ?? 0}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{req.source}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(req.id)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-sm text-gray-500">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded border hover:bg-white disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded border hover:bg-white disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal title="Add Requirement" onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <FormField label="Title *">
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. User can log in with email and password" />
            </FormField>
            <FormField label="Description">
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Detailed description..." />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Priority">
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </FormField>
              <FormField label="Source">
                <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="MANUAL">Manual</option>
                  <option value="JIRA">Jira</option>
                  <option value="SPEC">Spec</option>
                  <option value="CSV">CSV</option>
                </select>
              </FormField>
            </div>
            <FormField label="External ID (optional)">
              <input value={form.externalId} onChange={e => setForm({ ...form, externalId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. JIRA-123" />
            </FormField>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <Modal title="Import Requirements from CSV" onClose={() => setShowImport(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Paste CSV rows: <code className="bg-gray-100 px-1 rounded">title, description, priority, externalId</code>
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              rows={8}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder={`User login with valid credentials, Check email+password flow, HIGH, REQ-001\nUser logout, User can log out, MEDIUM, REQ-002`}
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleImport} disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Helper Components ─────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`border rounded-lg p-3 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-800 text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
