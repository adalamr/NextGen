import axios, { AxiosInstance } from 'axios';

/**
 * Azure DevOps Connector
 * Supports: Trigger runs, receive webhooks, push results back
 */
export class AzureDevOpsConnector {
  private client: AxiosInstance;
  private orgUrl: string;

  constructor(config: { orgUrl: string; pat: string }) {
    this.orgUrl = config.orgUrl;
    this.client = axios.create({
      baseURL: config.orgUrl,
      headers: {
        Authorization: `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Trigger a pipeline run in Azure DevOps
  async triggerPipeline(project: string, pipelineId: number, branch = 'main') {
    const response = await this.client.post(
      `/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.0`,
      {
        resources: { repositories: { self: { refName: `refs/heads/${branch}` } } },
        variables: {},
      },
    );
    return response.data;
  }

  // Create test run in Azure DevOps Test Plans
  async createTestRun(project: string, dto: {
    name: string;
    planId: number;
    environmentDetails: Record<string, unknown>;
  }) {
    const response = await this.client.post(
      `/${project}/_apis/test/runs?api-version=7.0`,
      { name: dto.name, plan: { id: dto.planId }, environmentDetails: dto.environmentDetails },
    );
    return response.data;
  }

  // Push test results back to Azure DevOps
  async publishTestResults(project: string, runId: number, results: Array<{
    testCaseTitle: string;
    outcome: 'Passed' | 'Failed' | 'NotExecuted';
    durationInMs: number;
    errorMessage?: string;
  }>) {
    const response = await this.client.post(
      `/${project}/_apis/test/runs/${runId}/results?api-version=7.0`,
      results.map((r) => ({
        testCaseTitle: r.testCaseTitle,
        outcome: r.outcome,
        durationInMs: r.durationInMs,
        errorMessage: r.errorMessage,
      })),
    );
    return response.data;
  }

  // Validate incoming webhook from Azure DevOps
  validateWebhook(payload: unknown, _secret: string): boolean {
    // Azure DevOps uses basic auth for webhook validation
    // In production: verify the request IP against Azure DevOps IP ranges
    return !!payload;
  }

  // Parse Azure DevOps webhook payload
  parseWebhookEvent(payload: Record<string, unknown>): {
    eventType: string;
    project: string;
    branch?: string;
    commitId?: string;
  } {
    return {
      eventType: (payload.eventType as string) || '',
      project: (payload.resourceContainers as any)?.project?.name || '',
      branch: (payload.resource as any)?.refUpdates?.[0]?.name || '',
      commitId: (payload.resource as any)?.commits?.[0]?.commitId || '',
    };
  }
}
