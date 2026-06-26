import React, { useState, useEffect } from 'react';
import { appModelApi } from '../../../services/layer1.service';
import { Plus, Search, Trash2, RefreshCw, Code, Layout, Database, Users } from 'lucide-react';

interface AppModelTabProps {
  projectId: string;
}

type SubTab = 'api' | 'pages' | 'schema' | 'roles';

export default function AppModelTab({ projectId }: AppModelTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('api');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [contracts, setContracts] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [schema, setSchema] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAll();
  }, [projectId, subTab, search]);

  const loadAll = async () => {
    setLoading(true); setError('');
    try {
      if (subTab === 'api') {
        const res = await appModelApi.getContracts(projectId, search);
        setContracts(res.data.data);
      } else if (subTab === 'pages') {
        const res = await appModelApi.getPages(projectId, search);
        setPages(res.data.data);
      } else if (subTab === 'schema') {
        const res = await appModelApi.getSchema(projectId);
        setSchema(res.data.data);
      } else {
        const res = await appModelApi.getRoles(projectId);
        setRoles(res.data.data);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load');
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    setError('');
    try {
      if (subTab === 'api') {
        if (!addForm.endpoint || !addForm.method) { setError('Endpoint and Method are required'); return; }
        await appModelApi.createContract(projectId, addForm);
      } else if (subTab === 'pages') {
        if (!addForm.name) { setError('Page name is required'); return; }
        await appModelApi.createPage(projectId, addForm);
      } else if (subTab === 'schema') {
        if (!addForm.tableName) { setError('Table name is required'); return; }
        await appModelApi.createSchemaTable(projectId, addForm);
      } else {
        if (!addForm.roleName) { setError('Role name is required'); return; }
        await appModelApi.upsertRole(projectId, addForm);
      }
      setShowAdd(false); setAddForm({});
      loadAll();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to save');
    }
  };

  const handleDeleteContract = async (id: string) => {
    if (!confirm('Remove this API contract?')) return;
    try {
      await appModelApi.deleteContract(id, projectId);
      loadAll();
    } catch { /* silent */ }
  };

  const SUB_TABS: Array<{ key: SubTab; label: string; icon: React.ReactNode }> = [
    { key: 'api', label: 'API Contracts', icon: <Code className="w-4 h-4" /> },
    { key: 'pages', label: 'UI Pages', icon: <Layout className="w-4 h-4" /> },
    { key: 'schema', label: 'DB Schema', icon: <Database className="w-4 h-4" /> },
    { key: 'roles', label: 'User Roles', icon: <Users className="w-4 h-4" /> },
  ];

  const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-yellow-100 text-yellow-700',
    PATCH: 'bg-orange-100 text-orange-700',
    DELETE: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex border-b gap-0">
        {SUB_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSubTab(tab.key); setSearch(''); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition
              ${subTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2">
        {(subTab === 'api' || subTab === 'pages') && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${subTab === 'api' ? 'endpoints' : 'pages'}...`}
              className="pl-9 pr-3 py-2 border rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setShowAdd(true); setAddForm({}); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" />
            Add {subTab === 'api' ? 'Endpoint' : subTab === 'pages' ? 'Page' : subTab === 'schema' ? 'Table' : 'Role'}
          </button>
          <button onClick={loadAll} className="p-2 border rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-500' : 'text-gray-500'}`} />
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

      {/* Content */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : (
          <>
            {/* API Contracts */}
            {subTab === 'api' && (
              contracts.length === 0 ? (
                <EmptyState message="No API contracts defined. Add endpoints or upload a Swagger/OpenAPI file via Connectors." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Method</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Endpoint</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Version</th>
                      <th className="w-10 px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contracts.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${METHOD_COLORS[c.method] || 'bg-gray-100 text-gray-600'}`}>{c.method}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.endpoint}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{c.version}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDeleteContract(c.id)} className="text-gray-300 hover:text-red-500 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* UI Pages */}
            {subTab === 'pages' && (
              pages.length === 0 ? (
                <EmptyState message="No UI pages defined. Upload HTML specs or UI documentation via Connectors." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Page Name</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">URL Pattern</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Elements</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pages.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.urlPattern || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{Array.isArray(p.elements) ? p.elements.length : 0}</td>
                        <td className="px-4 py-3 text-gray-600">{Array.isArray(p.actions) ? p.actions.length : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* DB Schema */}
            {subTab === 'schema' && (
              schema.length === 0 ? (
                <EmptyState message="No database schema defined. Upload SQL DDL files via Connectors." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Table Name</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Columns</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Relations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {schema.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-800">{t.tableName}</td>
                        <td className="px-4 py-3 text-gray-600">{Array.isArray(t.columns) ? t.columns.length : 0}</td>
                        <td className="px-4 py-3 text-gray-600">{Array.isArray(t.relations) ? t.relations.length : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* User Roles */}
            {subTab === 'roles' && (
              roles.length === 0 ? (
                <EmptyState message="No user roles defined. Add roles to enable role-based test case generation." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Role Name</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Permissions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {roles.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{r.roleName}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{r.description || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{Array.isArray(r.permissions) ? r.permissions.length : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">
                Add {subTab === 'api' ? 'API Endpoint' : subTab === 'pages' ? 'UI Page' : subTab === 'schema' ? 'DB Table' : 'User Role'}
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              {subTab === 'api' && <>
                <Field label="Method *">
                  <select value={addForm.method || 'GET'} onChange={e => setAddForm({ ...addForm, method: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Endpoint Path *">
                  <input value={addForm.endpoint || ''} onChange={e => setAddForm({ ...addForm, endpoint: e.target.value })}
                    placeholder="/api/users/{id}" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </Field>
                <Field label="Version">
                  <input value={addForm.version || 'v1'} onChange={e => setAddForm({ ...addForm, version: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </Field>
              </>}

              {subTab === 'pages' && <>
                <Field label="Page Name *">
                  <input value={addForm.name || ''} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="Login Page" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </Field>
                <Field label="URL Pattern">
                  <input value={addForm.urlPattern || ''} onChange={e => setAddForm({ ...addForm, urlPattern: e.target.value })}
                    placeholder="/login" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </Field>
              </>}

              {subTab === 'schema' && <>
                <Field label="Table Name *">
                  <input value={addForm.tableName || ''} onChange={e => setAddForm({ ...addForm, tableName: e.target.value })}
                    placeholder="users" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </Field>
              </>}

              {subTab === 'roles' && <>
                <Field label="Role Name *">
                  <input value={addForm.roleName || ''} onChange={e => setAddForm({ ...addForm, roleName: e.target.value })}
                    placeholder="ADMIN" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </Field>
                <Field label="Description">
                  <input value={addForm.description || ''} onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                    placeholder="Full access role" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </Field>
              </>}

              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleAdd} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-12 text-gray-400 text-sm px-8">{message}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
