import type { RuntimeDefinition } from '@teambit/harmony';
import { CLIAspect, type CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, type LoggerMain, type Logger } from '@teambit/logger';
import { CloudAspect, type CloudMain } from '@teambit/cloud';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { getCloudDomain } from '@teambit/legacy.constants';
import { readLastExport, type LastExportData } from '@teambit/export';
import { stripComponentVersion } from './ripple-utils';
import stripAnsi from 'strip-ansi';
import { RippleAspect } from './ripple.aspect';
import { RippleCmd, RippleListCmd, RippleLogCmd, RippleErrorsCmd, RippleRetryCmd, RippleStopCmd } from './ripple.cmd';

export type JobStatus = {
  startedAt?: string;
  finishedAt?: string;
  phase?: string;
};

export type RippleJob = {
  id: string;
  /** url-safe identifier used by the cloud UI; the bit.cloud /ripple-ci/job/ page resolves by slug, not id */
  slug?: string;
  name?: string;
  laneId?: string;
  simulation?: boolean;
  user?: { username?: string; displayName?: string };
  status?: JobStatus;
};

export type RippleJobFull = RippleJob & { hash?: string; ciGraph?: string; ciComponentGraph?: string };

export type BuildTaskStatus = {
  status?: string;
  warnings?: number;
};

export type BuildTaskSummary = {
  name?: string;
  description?: string;
  startTime?: string;
  status?: BuildTaskStatus;
};

export type ComponentBuildSummary = {
  id?: string;
  name?: string;
  tasks?: BuildTaskSummary[];
};

export type CiGraphNode = {
  componentIds: string[];
  containerName: string;
  phase: string;
};

export class RippleMain {
  static runtime: RuntimeDefinition = MainRuntime;
  static dependencies = [CLIAspect, CloudAspect, LoggerAspect, WorkspaceAspect];

  constructor(
    private cloud: CloudMain,
    private logger: Logger,
    private workspace?: Workspace
  ) {}

  private static LIST_JOBS = `
    query listJobs($filters: FilterOptions, $limit: Int, $offset: Int) {
      listJobs(filters: $filters, limit: $limit, offset: $offset) {
        id
        name
        laneId
        simulation
        user { username displayName }
        status { startedAt finishedAt phase }
      }
    }
  `;

  private static GET_JOB = `
    query getJob($jobId: ID!) {
      getJob(jobId: $jobId) {
        id
        slug
        name
        laneId
        hash
        simulation
        user { username displayName }
        status { startedAt finishedAt phase }
        ciGraph
        ciComponentGraph
      }
    }
  `;

  private static GET_JOB_BY_SLUG = `
    query getJobBySlug($slug: ID!) {
      getJob(slug: $slug) {
        id
        slug
        name
        laneId
        hash
        simulation
        user { username displayName }
        status { startedAt finishedAt phase }
        ciGraph
        ciComponentGraph
      }
    }
  `;

  private static GET_COMPONENT_BUILD_SUMMARY = `
    query getComponentBuildSummary($jobId: ID!, $componentId: String!) {
      getComponentBuildSummary(jobId: $jobId, componentId: $componentId) {
        id
        name
        tasks {
          name
          description
          startTime
          status { status warnings }
        }
      }
    }
  `;

  private static RETRY_JOB = `
    mutation retryJob($jobId: ID!) {
      retryJob(jobId: $jobId) {
        id
        slug
        name
        laneId
        status { startedAt finishedAt phase }
      }
    }
  `;

  private static STOP_JOB = `
    mutation stopJob($jobId: ID!) {
      stopJob(jobId: $jobId) {
        id
        slug
        name
        laneId
        status { startedAt finishedAt phase }
      }
    }
  `;

  private ensureAuthenticated(): void {
    if (!this.cloud.getAuthToken()) {
      throw new Error('You are not logged in. Please run "bit login" first.');
    }
  }

  private async fetchRippleGQL<T>(query: string, variables?: Record<string, any>): Promise<T | null> {
    this.ensureAuthenticated();
    const graphqlUrl = `${this.cloud.getCloudApi()}/graphql`;
    const body = JSON.stringify({ query, variables });
    const headers = {
      'Content-Type': 'application/json',
      ...this.cloud.getAuthHeader(),
    };
    const response = await fetch(graphqlUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ripple CI API returned HTTP ${response.status}: ${text}`);
    }
    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      const messages = json.errors.map((e) => e.message).join(', ');
      throw new Error(`Ripple CI API error: ${messages}`);
    }
    return json.data ?? null;
  }

  async listJobs(opts: {
    limit?: number;
    offset?: number;
    filters?: { lanes?: string[]; owners?: string[]; scopes?: string[]; status?: string };
  }): Promise<RippleJob[]> {
    const data = await this.fetchRippleGQL<{ listJobs: RippleJob[] }>(RippleMain.LIST_JOBS, {
      filters: opts.filters,
      limit: opts.limit ?? 20,
      offset: opts.offset,
    });
    return data?.listJobs ?? [];
  }

  async getJob(jobId: string): Promise<RippleJobFull | null> {
    const data = await this.fetchRippleGQL<{
      getJob: RippleJobFull;
    }>(RippleMain.GET_JOB, { jobId });
    return data?.getJob ?? null;
  }

  /**
   * parse a job's ciGraph (internal graph) to extract per-node build status.
   * ciGraph has the job-specific build results (unlike ciComponentGraph which is static).
   * each node represents a build container that builds one or more components.
   */
  getCiGraphNodes(job: { ciGraph?: string }): CiGraphNode[] {
    if (!job.ciGraph) return [];
    try {
      const graph = JSON.parse(job.ciGraph) as { nodes?: Array<{ id: string; attr: string | Record<string, any> }> };
      if (!graph.nodes) return [];
      return graph.nodes.map((node) => {
        const attr = typeof node.attr === 'string' ? JSON.parse(node.attr) : node.attr;
        const ids: string[] = (attr.ids || []).map((id: string) => stripComponentVersion(id));
        return {
          componentIds: ids,
          containerName: attr.status?.name || node.id,
          phase: attr.status?.phase || 'UNKNOWN',
        };
      });
    } catch {
      return [];
    }
  }

  async getComponentBuildSummary(jobId: string, componentId: string): Promise<ComponentBuildSummary | null> {
    const data = await this.fetchRippleGQL<{ getComponentBuildSummary: ComponentBuildSummary }>(
      RippleMain.GET_COMPONENT_BUILD_SUMMARY,
      { jobId, componentId }
    );
    return data?.getComponentBuildSummary ?? null;
  }

  /**
   * fetch build logs for a specific container in a job via the REST SSE endpoint.
   * uses an idle timeout to detect end-of-stream (SSE connections may not close).
   */
  async getContainerLog(jobId: string, containerName: string): Promise<string[]> {
    this.ensureAuthenticated();
    const url = `${this.cloud.getCloudApi()}/ripple-ci/api/job/log/${jobId}/${containerName}`;
    const headers = {
      Accept: 'text/event-stream',
      ...this.cloud.getAuthHeader(),
    };
    const controller = new AbortController();
    // hard cap to avoid hanging forever
    const hardTimeout = setTimeout(() => controller.abort(), 30_000);
    const messages: string[] = [];
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok || !response.body) {
        clearTimeout(hardTimeout);
        return [];
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const resetIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), 3_000);
      };
      resetIdle();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.substring(6)) as { message?: string };
            if (parsed.message != null) messages.push(parsed.message);
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        this.logger.warn(`Failed to fetch container log: ${err?.message}`);
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(hardTimeout);
    }
    return messages;
  }

  /**
   * fetch build logs for multiple containers in parallel.
   */
  async getContainerLogs(jobId: string, containerNames: string[]): Promise<Map<string, string[]>> {
    const results = await Promise.allSettled(
      containerNames.map(async (name) => {
        const log = await this.getContainerLog(jobId, name);
        return { name, log };
      })
    );
    const logMap = new Map<string, string[]>();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        logMap.set(result.value.name, result.value.log);
      }
    }
    return logMap;
  }

  /**
   * extract the error section from container log messages.
   * looks for common error patterns in the build output.
   */
  extractErrorsFromLog(messages: string[]): string[] {
    const patterns = ['errors were found', 'Failed task', 'threw an error', 'Error:', 'FAIL'];
    for (const pattern of patterns) {
      const idx = messages.findIndex((m) => stripAnsi(m).includes(pattern));
      if (idx >= 0) {
        return messages.slice(idx);
      }
    }
    // last resort: grab the last 30 lines if the log has content
    if (messages.length > 0) {
      return messages.slice(-30);
    }
    return [];
  }

  async retryJob(jobId: string): Promise<RippleJob | null> {
    const data = await this.fetchRippleGQL<{ retryJob: RippleJob }>(RippleMain.RETRY_JOB, { jobId });
    return data?.retryJob ?? null;
  }

  async stopJob(jobId: string): Promise<RippleJob | null> {
    const data = await this.fetchRippleGQL<{ stopJob: RippleJob }>(RippleMain.STOP_JOB, { jobId });
    return data?.stopJob ?? null;
  }

  /**
   * detect the current lane from the workspace.
   * returns the laneId in "scope/lane-name" format, or undefined if not on a lane.
   */
  getCurrentLaneId(): string | undefined {
    if (!this.workspace) return undefined;
    const laneId = this.workspace.getCurrentLaneId();
    if (!laneId || laneId.isDefault()) return undefined;
    return laneId.toString();
  }

  /**
   * read the last-export.json written by ExportMain after a successful export.
   * used to auto-resolve the ripple job when the user is on main (no current lane).
   */
  async getLastExport(): Promise<LastExportData | null> {
    if (!this.workspace) return null;
    return readLastExport(this.workspace.scope.path);
  }

  /**
   * the central-hub returns url slugs in `metadata.jobs`, not the GraphQL job ids accepted by getJob(jobId).
   * the schema also supports getJob(slug: ID!), which we use here to fetch the job directly from a slug.
   */
  async getJobBySlug(slug: string): Promise<RippleJobFull | null> {
    const data = await this.fetchRippleGQL<{
      getJob: RippleJobFull;
    }>(RippleMain.GET_JOB_BY_SLUG, { slug });
    return data?.getJob ?? null;
  }

  /**
   * find the latest job for a given laneId, optionally filtered by status phase.
   */
  async findLatestJobForLane(laneId: string, phase?: string): Promise<RippleJob | null> {
    const filters: { lanes: string[]; status?: string } = { lanes: [laneId] };
    if (phase) {
      filters.status = phase;
    }
    const jobs = await this.listJobs({ filters, limit: 1 });
    return jobs[0] ?? null;
  }

  /**
   * detect the workspace owner from the workspace defaultScope.
   */
  getDefaultOwner(): string | undefined {
    const defaultScope = this.workspace?.defaultScope;
    if (!defaultScope?.includes('.')) return undefined;
    return defaultScope.split('.')[0];
  }

  getJobUrl(job: RippleJob): string {
    // the bit.cloud UI resolves the /ripple-ci/job/<id-or-slug> segment by slug;
    // job.id (a uuid) returns "No CI job found", so prefer slug when present.
    const segment = job.slug || job.id;
    if (job.laneId) {
      // laneId format: "scope/lane-name", e.g. "att-bit.duc/my-lane"
      const [scope, ...laneParts] = job.laneId.split('/');
      const laneName = laneParts.join('/');
      if (scope && laneName) {
        return `https://${getCloudDomain()}/${scope.split('.').join('/')}/~lane/${laneName}/~ripple-ci/job/${segment}`;
      }
    }
    return `https://${getCloudDomain()}/ripple-ci/job/${segment}`;
  }

  static async provider([cli, cloud, loggerAspect, workspace]: [CLIMain, CloudMain, LoggerMain, Workspace]) {
    const logger = loggerAspect.createLogger(RippleAspect.id);
    const ripple = new RippleMain(cloud, logger, workspace);

    const rippleCmd = new RippleCmd();
    rippleCmd.commands = [
      new RippleListCmd(ripple),
      new RippleLogCmd(ripple),
      new RippleErrorsCmd(ripple),
      new RippleRetryCmd(ripple),
      new RippleStopCmd(ripple),
    ];
    cli.register(rippleCmd);

    return ripple;
  }
}

RippleAspect.addRuntime(RippleMain);
