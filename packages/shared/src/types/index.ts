// ============================================================
// Shared Types across API, Workers, and Web
// ============================================================

export type Role = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'MEMBER';

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED' | 'DRAFT';

export type TestCaseStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'DEPRECATED';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ScriptFramework = 'PLAYWRIGHT' | 'CYPRESS' | 'SELENIUM' | 'REST_ASSURED' | 'K6';

export type ExecutionStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type TestResultStatus = 'PASS' | 'FAIL' | 'FLAKY' | 'SKIPPED';

export type ReviewGateType = 'TEST_CASE_APPROVAL' | 'HEALING_PROPOSAL' | 'SCRIPT_CHANGE' | 'COVERAGE_SIGN_OFF';

export type CICDProvider = 'AZURE_DEVOPS' | 'JENKINS';

export type ConnectorType = 'SPEC' | 'CODE_REPO' | 'API_SPEC' | 'DB_SCHEMA' | 'UI_DOM' | 'DEFECTS' | 'LOGS' | 'TEST_RESULTS';

export type IngestionTrigger = 'PR_MERGED' | 'SPEC_UPDATED' | 'NIGHTLY' | 'MANUAL';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: number;
    details?: Array<{ field: string; message: string }>;
  };
}
