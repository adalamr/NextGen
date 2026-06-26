/**
 * Layer 1 — Frontend API Service
 * Provides typed wrappers around all Layer 1 REST endpoints.
 */

import apiClient from './api.client';

// ── Requirements ──────────────────────────────────────────────────────

export const requirementsApi = {
  list: (projectId: string, params?: Record<string, unknown>) =>
    apiClient.get('/requirements', { params: { projectId, ...params } }),

  stats: (projectId: string) =>
    apiClient.get('/requirements/stats', { params: { projectId } }),

  get: (id: string, projectId: string) =>
    apiClient.get(`/requirements/${id}`, { params: { projectId } }),

  create: (projectId: string, data: Record<string, unknown>) =>
    apiClient.post('/requirements', { projectId, ...data }),

  bulkImport: (projectId: string, requirements: unknown[]) =>
    apiClient.post('/requirements/bulk-import', { projectId, requirements }),

  update: (id: string, projectId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/requirements/${id}`, { projectId, ...data }),

  delete: (id: string, projectId: string) =>
    apiClient.delete(`/requirements/${id}`, { params: { projectId } }),
};

// ── App Model ─────────────────────────────────────────────────────────

export const appModelApi = {
  // API Contracts
  getContracts: (projectId: string, search?: string) =>
    apiClient.get('/app-model/api-contracts', { params: { projectId, search } }),
  createContract: (projectId: string, data: Record<string, unknown>) =>
    apiClient.post('/app-model/api-contracts', { projectId, ...data }),
  deleteContract: (id: string, projectId: string) =>
    apiClient.delete(`/app-model/api-contracts/${id}`, { params: { projectId } }),

  // UI Pages
  getPages: (projectId: string, search?: string) =>
    apiClient.get('/app-model/pages', { params: { projectId, search } }),
  createPage: (projectId: string, data: Record<string, unknown>) =>
    apiClient.post('/app-model/pages', { projectId, ...data }),

  // DB Schema
  getSchema: (projectId: string) =>
    apiClient.get('/app-model/schema', { params: { projectId } }),
  createSchemaTable: (projectId: string, data: Record<string, unknown>) =>
    apiClient.post('/app-model/schema', { projectId, ...data }),

  // User Roles
  getRoles: (projectId: string) =>
    apiClient.get('/app-model/roles', { params: { projectId } }),
  upsertRole: (projectId: string, data: Record<string, unknown>) =>
    apiClient.post('/app-model/roles', { projectId, ...data }),

  // Summary for LLM
  getSummary: (projectId: string) =>
    apiClient.get('/app-model/summary', { params: { projectId } }),
};

// ── Knowledge Base ────────────────────────────────────────────────────

export const knowledgeBaseApi = {
  list: (projectId: string, params?: Record<string, unknown>) =>
    apiClient.get('/knowledge-base', { params: { projectId, ...params } }),

  stats: (projectId: string) =>
    apiClient.get('/knowledge-base/stats', { params: { projectId } }),

  search: (projectId: string, query: string, options?: { topK?: number; docType?: string }) =>
    apiClient.post('/knowledge-base/search', { projectId, query, ...options }),

  delete: (id: string, projectId: string) =>
    apiClient.delete(`/knowledge-base/${id}`, { params: { projectId } }),
};

// ── Templates ─────────────────────────────────────────────────────────

export const templatesApi = {
  // Input Templates (1A)
  getInputTemplates: () => apiClient.get('/templates/input'),
  getActiveInputTemplate: () => apiClient.get('/templates/input/active'),
  createInputTemplate: (data: Record<string, unknown>) =>
    apiClient.post('/templates/input', data),
  updateInputTemplate: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/templates/input/${id}`, data),

  // Output Templates (1B)
  getOutputTemplates: () => apiClient.get('/templates/output'),
  getActiveOutputTemplate: () => apiClient.get('/templates/output/active'),
  createOutputTemplate: (data: Record<string, unknown>) =>
    apiClient.post('/templates/output', data),
  updateOutputTemplate: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/templates/output/${id}`, data),

  // Sample I/O Pairs (1D)
  getSamplePairs: (params?: Record<string, unknown>) =>
    apiClient.get('/templates/sample-pairs', { params }),
  getFewShot: (category?: string, maxPairs?: number) =>
    apiClient.get('/templates/sample-pairs/few-shot', { params: { category, maxPairs } }),
  createSamplePair: (data: Record<string, unknown>) =>
    apiClient.post('/templates/sample-pairs', data),
  updateSamplePair: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/templates/sample-pairs/${id}`, data),
  deleteSamplePair: (id: string) =>
    apiClient.delete(`/templates/sample-pairs/${id}`),

  // Knowledge Feedback / Gold Standards
  submitFeedback: (data: Record<string, unknown>) =>
    apiClient.post('/templates/feedback', data),
  getGoldStandards: (projectId: string) =>
    apiClient.get('/templates/gold-standards', { params: { projectId } }),
};

// ── Connectors ────────────────────────────────────────────────────────
export const connectorsApi = {
  list: (projectId: string) =>
    apiClient.get('/connectors', { params: { projectId } }),
  get: (id: string) =>
    apiClient.get(`/connectors/${id}`),
  create: (data: Record<string, unknown>) =>
    apiClient.post('/connectors', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/connectors/${id}`, data),
  delete: (id: string) =>
    apiClient.delete(`/connectors/${id}`),
  triggerSync: (id: string) =>
    apiClient.post(`/connectors/${id}/sync`),
};

// -- Traceability --
export const traceabilityApi = {
  getMatrix: (projectId: string) =>
    apiClient.get(`/traceability/${projectId}`),

  getCoverage: (projectId: string) =>
    apiClient.get(`/traceability/${projectId}/coverage`),

  getRequirementRow: (projectId: string, reqId: string) =>
    apiClient.get(`/traceability/${projectId}/${reqId}`),

  linkTestCases: (projectId: string, reqId: string, testCaseIds: string[]) =>
    apiClient.post(`/traceability/${projectId}/${reqId}/tests`, { testCaseIds }),

  linkDefect: (projectId: string, reqId: string, defectId: string) =>
    apiClient.post(`/traceability/${projectId}/${reqId}/defects`, { defectId }),
};
