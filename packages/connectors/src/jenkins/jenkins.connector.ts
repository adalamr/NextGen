import axios, { AxiosInstance } from 'axios';

/**
 * Jenkins Connector
 * Supports: Trigger builds, receive webhooks, fetch results
 */
export class JenkinsConnector {
  private client: AxiosInstance;

  constructor(config: { url: string; user: string; token: string }) {
    this.client = axios.create({
      baseURL: config.url,
      auth: { username: config.user, password: config.token },
    });
  }

  // Trigger a Jenkins job build
  async triggerBuild(jobName: string, params?: Record<string, string>) {
    const path = params
      ? `/job/${jobName}/buildWithParameters`
      : `/job/${jobName}/build`;

    const response = await this.client.post(path, null, {
      params: params,
    });
    return { queuedAt: response.headers.location };
  }

  // Get build status
  async getBuildStatus(jobName: string, buildNumber: number) {
    const response = await this.client.get(
      `/job/${jobName}/${buildNumber}/api/json`,
    );
    return response.data;
  }

  // Get latest build
  async getLatestBuild(jobName: string) {
    const response = await this.client.get(
      `/job/${jobName}/lastBuild/api/json`,
    );
    return response.data;
  }

  // Parse Jenkins webhook payload
  parseWebhookEvent(payload: Record<string, unknown>): {
    jobName: string;
    buildNumber: number;
    status: string;
    branch?: string;
  } {
    return {
      jobName: (payload.name as string) || '',
      buildNumber: (payload.build as any)?.number || 0,
      status: (payload.build as any)?.status || '',
      branch: (payload.build as any)?.scm?.branch || '',
    };
  }
}
