import React, { useState, useEffect, useCallback } from 'react';
import { traceabilityApi } from '../../../services/layer1.service';
import { RefreshCw, ChevronDown, ChevronUp, Link, AlertCircle, CheckCircle, MinusCircle } from 'lucide-react';

interface TraceabilityTabProps {
  projectId: string;
}

interface MatrixRow {
  id: string;
  externalId?: string;
  title: string;
  priority: string;
  status: string;
  testCaseCount: number;
  techniqueCount: number;
  techniques: string[];
  defectCount: number;
  defectIds: string[];
  coveragePct: number;
  coverageStatus: 'COVERED' | 'PARTIAL' | 'NOT_COVERED';
}

interface MatrixSummary {
  total: number;
  covered: number;
  partial: number;
  notCovered: number;
  overallCoveragePct: number;
  gaps: string[];
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-gray-100 text-gray-500',
};

const COVERAGE_CONFIG: Record<string, { label: string; bar: string; badge: string; icon: React.ReactNode }> = {
  COVERED:     { label: 'Covered',     bar: 'bg-green-500',  badge: 'bg-green-100 text-green-700',  icon: <CheckCircle  className="w-3.5 h-3.5" /> },
  PARTIAL:     { label: 'Partial',     bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', icon: <MinusCircle  className="w-3.5 h-3.5" /> },
  NOT_COVERED: { label: 'Not Covered', bar: 'bg-red-400',    badge: 'bg-red-100 text-red-600',       icon: <AlertCircle  className="w-3.5 h-3.5" /> },
};

export default function TraceabilityTab({ projectId }: TraceabilityTabProps) {
  const [requirements, setRequirements] = useState<MatrixRow[]>([]);
  const [summary, setSummary] = useState<MatrixSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'' | 'COVERED' | 'PARTIAL' | 'NOT_COVERED'>('');

  // Link defect modal state
  const [defectModal, setDefectModal] = useState<{ reqId: string; reqTitle: string } | null>(null);
  const [defectInput, setDefectInput] = useState('');
  const [defectSaving, setDefectSaving] = useState(false);
  const [defectError, setDefectError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await traceabilityApi.getMatrix(projectId);
      setRequirements(res.data.data.requirements);
      setSummary(res.data.data.summary);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load traceability matrix');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleLinkDefect = async () => {
    if (!defectModal || !defectInput.trim()) { setDefectError('Defect ID is required'); return; }
    setDefectSaving(true); setDefectError('');
    try {
      await traceabilityApi.linkDefect(projectId, defectModal.reqId, defectInput.trim());
      setDefectModal(null);
      setDefectInput('');
      load();
    } catch (e: any) {
      setDefectError(e.response?.data?.message || 'Failed to link defect');
    } finally { setDefectSaving(false); }
  };

  const filtered = filterStatus
    ? requirements.filter(r => r.coverageStatus === filterStatus)
    : requirements;

  return (
    <div className="space-y-5">

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="Overall Coverage"
            value={`${summary.overallCoveragePct}%`}
            sub={`${summary.total} requirements`}
            color="indigo"
          />
          <SummaryCard
            label="Covered"
            value={String(summary.covered)}
            sub="all techniques met"
            color="green"
            onClick={() => setFilterStatus(filterStatus === 'COVERED' ? '' : 'COVERED')}
            active={filterStatus === 'COVERED'}
          />
          <SummaryCard
            label="Partial"
            value={String(summary.partial)}
            sub="some techniques missing"
            color="yellow"
            onClick={() => setFilterStatus(filterStatus === 'PARTIAL' ? '' : 'PARTIAL')}
            active={filterStatus === 'PARTIAL'}
          />
          <SummaryCard
            label="Not Covered"
            value={String(summary.notCovered)}
            sub="no test cases linked"
            color="red"
            onClick={() => setFilterStatus(filterStatus === 'NOT_COVERED' ? '' : 'NOT_COVERED')}
            active={filterStatus === 'NOT_COVERED'}
          />
        </div>
      )}

      {/* Coverage Progress Bar */}
      {summary && (
        <div className="bg-white border rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Requirement Coverage Progress</span>
            <span className="text-sm font-bold text-indigo-600">{summary.overallCoveragePct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden flex">
            {summary.total > 0 && (
              <>
                <div
                  className="bg-green-500 h-3 transition-all"
                  style={{ width: `${(summary.covered / summary.total) * 100}%` }}
                />
                <div
                  className="bg-yellow-400 h-3 transition-all"
                  style={{ width: `${(summary.partial / summary.total) * 100}%` }}
                />
                <div
                  className="bg-red-400 h-3 transition-all"
                  style={{ width: `${(summary.notCovered / summary.total) * 100}%` }}
                />
              </>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Covered</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> Partial</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> Not Covered</span>
          </div>
        </div>
      )}

      {/* Coverage Gaps Alert */}
      {summary && summary.gaps.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700">Coverage Gaps ({summary.gaps.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {summary.gaps.map((gap, i) => (
              <span key={i} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-mono">{gap}</span>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {filterStatus && (
            <button
              onClick={() => setFilterStatus('')}
              className="text-xs px-2 py-1 bg-indigo-100 text-indigo-600 rounded-full hover:bg-indigo-200 transition"
            >
              Filter: {filterStatus.replace('_', ' ')} ×
            </button>
          )}
          <span className="text-sm text-gray-500">
            {filtered.length} of {requirements.length} requirements
          </span>
        </div>
        <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-500' : 'text-gray-500'}`} />
        </button>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

      {/* Matrix Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading traceability matrix...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Link className="w-8 h-8 mx-auto mb-3 text-indigo-200" />
            <p className="font-medium text-gray-600">
              {requirements.length === 0
                ? 'No requirements found. Add requirements in the Requirements tab first.'
                : 'No requirements match the selected filter.'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-6"></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Requirement</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Tests</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Defects</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Coverage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Status</th>
                  <th className="w-10 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((req) => {
                  const cfg = COVERAGE_CONFIG[req.coverageStatus];
                  const isExpanded = expandedId === req.id;

                  return (
                    <React.Fragment key={req.id}>
                      <tr className="hover:bg-gray-50 transition">
                        {/* Expand toggle */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : req.id)}
                            className="text-gray-400 hover:text-indigo-600 transition"
                          >
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4" />
                              : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>

                        {/* Title */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{req.title}</div>
                          {req.externalId && (
                            <span className="text-xs text-indigo-500 font-mono">{req.externalId}</span>
                          )}
                        </td>

                        {/* Priority */}
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[req.priority] || 'bg-gray-100 text-gray-600'}`}>
                            {req.priority}
                          </span>
                        </td>

                        {/* Test count */}
                        <td className="px-4 py-3 text-gray-700 font-medium">{req.testCaseCount}</td>

                        {/* Defect count */}
                        <td className="px-4 py-3 text-gray-600">
                          {req.defectCount > 0
                            ? <span className="text-red-500 font-medium">{req.defectCount}</span>
                            : <span className="text-gray-400">0</span>}
                        </td>

                        {/* Coverage bar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all ${cfg.bar}`}
                                style={{ width: `${req.coveragePct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600 w-8 text-right">{req.coveragePct}%</span>
                          </div>
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium w-fit ${cfg.badge}`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </td>

                        {/* Link defect action */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => { setDefectModal({ reqId: req.id, reqTitle: req.title }); setDefectInput(''); setDefectError(''); }}
                            className="text-gray-300 hover:text-red-500 transition"
                            title="Link a defect"
                          >
                            <Link className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className="bg-indigo-50/40">
                          <td colSpan={8} className="px-8 py-4">
                            <div className="grid grid-cols-2 gap-6 text-sm">
                              {/* Techniques */}
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                  Test Techniques Used ({req.techniqueCount})
                                </p>
                                {req.techniques.length === 0 ? (
                                  <p className="text-gray-400 text-xs">No test cases linked yet.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {req.techniques.map((t, i) => (
                                      <span key={i} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono">{t}</span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Defects */}
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                  Linked Defects ({req.defectCount})
                                </p>
                                {req.defectIds.length === 0 ? (
                                  <p className="text-gray-400 text-xs">No defects linked.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {req.defectIds.map((d, i) => (
                                      <span key={i} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-mono">{d}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Link Defect Modal */}
      {defectModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setDefectModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">Link Defect</h3>
              <button onClick={() => setDefectModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mb-4 truncate">
              Requirement: <span className="font-medium text-gray-700">{defectModal.reqTitle}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Defect ID *</label>
                <input
                  value={defectInput}
                  onChange={e => setDefectInput(e.target.value)}
                  placeholder="e.g. DEF-001 or JIRA-456"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  onKeyDown={e => e.key === 'Enter' && handleLinkDefect()}
                  autoFocus
                />
              </div>
              {defectError && <p className="text-red-600 text-sm">{defectError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDefectModal(null)}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLinkDefect}
                  disabled={defectSaving}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition"
                >
                  {defectSaving ? 'Linking...' : 'Link Defect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper Components ─────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color, onClick, active,
}: {
  label: string;
  value: string;
  sub: string;
  color: 'indigo' | 'green' | 'yellow' | 'red';
  onClick?: () => void;
  active?: boolean;
}) {
  const colors = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    green:  'bg-green-50  border-green-200  text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red:    'bg-red-50    border-red-200    text-red-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border rounded-xl p-3 text-left transition w-full
        ${colors[color]}
        ${onClick ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}
        ${active ? 'ring-2 ring-offset-1 ring-current' : ''}
      `}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-semibold mt-0.5">{label}</div>
      <div className="text-xs opacity-70 mt-0.5">{sub}</div>
    </button>
  );
}
