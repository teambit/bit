import { readFileSync } from 'fs';
import { join } from 'path';
import type { RuntimeDefinition } from '@teambit/harmony';
import { CLIAspect, type CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, type LoggerMain, type Logger } from '@teambit/logger';
import { CloudAspect, type CloudMain } from '@teambit/cloud';
import { getCloudDomain } from '@teambit/legacy.constants';
import { RippleAspect } from './ripple.aspect';
import { RippleCmd } from './ripple.cmd';
import { RippleListCmd } from './ripple-list.cmd';
import { RippleLogCmd } from './ripple-log.cmd';
import { RippleErrorsCmd } from './ripple-errors.cmd';
import { RippleRetryCmd } from './ripple-retry.cmd';
import { RippleStopCmd } from './ripple-stop.cmd';

export type JobStatus = {
  startedAt?: string;
  finishedAt?: string;
  phase?: string;
};

export type RippleJob = {
  id: string;
  name?: string;
  laneId?: string;
  simulation?: boolean;
  user?: { username?: string; displayName?: string };
  status?: JobStatus;
};

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

export type ComponentBuildStatus = {
  id: string;
  buildStatus: string;
};

export type CiGraphNodeStatus = {
  nodeId?: string;
  phase?: string;
  name?: string;
  startedAt?: string;
  finishedAt?: string;
  duration?: number;
};

export type CiGraphNode = {
  componentIds: string[];
  containerName: string;
  phase: string;
};

export class RippleMain {
  static runtime: RuntimeDefinition = MainRuntime;
  static dependencies = [CLIAspect, CloudAspect, LoggerAspect];

  constructor(
    private cloud: CloudMain,
    private logger: Logger
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

  private static GET_COMPONENTS_BUILD_STATUS = `
    query getComponents($ids: [ID]) {
      getComponents(ids: $ids) {
        id
        buildStatus
      }
    }
  `;

  private static GET_SCOPE_COMPONENTS = `
    query getScopeComponents($scopeId: String!) {
      getScopeComponents(scopeId: $scopeId) {
        id
      }
    }
  `;

  private static RETRY_JOB = `
    mutation retryJob($jobId: ID!) {
      retryJob(jobId: $jobId) {
        id
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
        name
        laneId
        status { startedAt finishedAt phase }
      }
    }
  `;

  private async fetchRippleGQL<T>(query: string, variables?: Record<string, any>): Promise<T | null> {
    const token = this.cloud.getAuthToken();
    if (!token) {
      throw new Error('You are not logged in. Please run "bit login" first.');
    }
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

  async getJob(
    jobId: string
  ): Promise<(RippleJob & { hash?: string; ciGraph?: string; ciComponentGraph?: string }) | null> {
    const data = await this.fetchRippleGQL<{
      getJob: RippleJob & { hash?: string; ciGraph?: string; ciComponentGraph?: string };
    }>(RippleMain.GET_JOB, { jobId });
    return data?.getJob ?? null;
  }

  /**
   * extract component IDs from a job's ciComponentGraph JSON.
   * ciComponentGraph.nodes[].id format: "scope/name@hash" — returns "scope/name".
   */
  getJobComponentIds(job: { ciComponentGraph?: string }): string[] {
    if (!job.ciComponentGraph) return [];
    try {
      const graph = JSON.parse(job.ciComponentGraph) as { nodes?: Array<{ id: string }> };
      if (!graph.nodes) return [];
      return graph.nodes.map((node) => {
        const atIdx = node.id.indexOf('@');
        return atIdx > 0 ? node.id.substring(0, atIdx) : node.id;
      });
    } catch {
      return [];
    }
  }

  /**
   * extract full component IDs (with hashes) from a job's ciComponentGraph JSON.
   * returns IDs in "scope/name@hash" format needed for getComponentsBuildStatus.
   */
  getJobComponentFullIds(job: { ciComponentGraph?: string }): string[] {
    if (!job.ciComponentGraph) return [];
    try {
      const graph = JSON.parse(job.ciComponentGraph) as { nodes?: Array<{ id: string }> };
      if (!graph.nodes) return [];
      return graph.nodes.map((node) => node.id);
    } catch {
      return [];
    }
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
        const ids: string[] = (attr.ids || []).map((id: string) => {
          const atIdx = id.indexOf('@');
          return atIdx > 0 ? id.substring(0, atIdx) : id;
        });
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
   * get build status for multiple components by their full IDs (scope/name@hash).
   * uses the getComponents query which works for private scopes (unlike getComponentBuildSummary).
   */
  async getComponentsBuildStatus(fullComponentIds: string[]): Promise<ComponentBuildStatus[]> {
    const data = await this.fetchRippleGQL<{ getComponents: ComponentBuildStatus[] }>(
      RippleMain.GET_COMPONENTS_BUILD_STATUS,
      { ids: fullComponentIds }
    );
    return data?.getComponents ?? [];
  }

  /**
   * fetch build logs for a specific container in a job via the REST SSE endpoint.
   * uses an idle timeout to detect end-of-stream (SSE connections may not close).
   */
  async getContainerLog(jobId: string, containerName: string): Promise<string[]> {
    const token = this.cloud.getAuthToken();
    if (!token) {
      throw new Error('You are not logged in. Please run "bit login" first.');
    }
    const url = `${this.cloud.getCloudApi()}/ripple-ci/api/job/log/${jobId}/${containerName}`;
    const headers = {
      Accept: 'text/event-stream',
      ...this.cloud.getAuthHeader(),
    };
    const controller = new AbortController();
    // hard cap to avoid hanging forever
    const hardTimeout = setTimeout(() => controller.abort(), 30_000);
    const messages: string[] = [];
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok || !response.body) {
        clearTimeout(hardTimeout);
        return [];
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // idle timeout: if no data arrives for 3s, the stream is done
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
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
      if (idleTimer) clearTimeout(idleTimer);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        this.logger.warn(`Failed to fetch container log: ${err?.message}`);
      }
    } finally {
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
    // eslint-disable-next-line no-control-regex
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

    // try several patterns, prefer the most specific first
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
   * get component IDs from a remote scope via the cloud API.
   * returns IDs in "scope/name" format (without version).
   */
  async getScopeComponentIds(scopeId: string): Promise<string[]> {
    const data = await this.fetchRippleGQL<{ getScopeComponents: Array<{ id: string }> }>(
      RippleMain.GET_SCOPE_COMPONENTS,
      { scopeId }
    );
    const components = data?.getScopeComponents ?? [];
    return components.map((c) => {
      // id format: "scope/name@version" - strip the version
      const atIdx = c.id.indexOf('@');
      return atIdx > 0 ? c.id.substring(0, atIdx) : c.id;
    });
  }

  /**
   * parse .bitmap (JSONC format with leading comments) from cwd.
   */
  private readBitmap(): Record<string, any> | null {
    try {
      let raw = readFileSync(join(process.cwd(), '.bitmap'), 'utf8');
      // strip block comments and line comments
      raw = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * detect the current lane from .bitmap in cwd.
   * returns the laneId in "scope/lane-name" format, or undefined if not on a lane.
   */
  getCurrentLaneId(): string | undefined {
    const bitmap = this.readBitmap();
    if (!bitmap) return undefined;
    const laneInfo = bitmap._bit_lane;
    if (!laneInfo?.id) return undefined;
    // laneInfo.id can be { name, scope } object or a string
    if (typeof laneInfo.id === 'string') return laneInfo.id;
    if (laneInfo.id.scope && laneInfo.id.name) return `${laneInfo.id.scope}/${laneInfo.id.name}`;
    return undefined;
  }

  /**
   * get component IDs tracked in the workspace .bitmap.
   * returns IDs in "scope/name" format suitable for getComponentBuildSummary.
   */
  getWorkspaceComponentIds(): string[] {
    const bitmap = this.readBitmap();
    if (!bitmap) return [];
    const ids: string[] = [];
    for (const [key, value] of Object.entries(bitmap)) {
      if (key.startsWith('_')) continue;
      const entry = value as { scope?: string; defaultScope?: string; name?: string };
      const scope = entry.scope || entry.defaultScope;
      const name = entry.name || key;
      if (scope) {
        ids.push(`${scope}/${name}`);
      }
    }
    return ids;
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
   * get component build summaries for multiple components in a job.
   * silently skips components that have no build data or API errors.
   * processes in batches to avoid overwhelming the API.
   */
  async getComponentBuildSummaries(jobId: string, componentIds: string[]): Promise<ComponentBuildSummary[]> {
    const BATCH_SIZE = 15;
    const summaries: ComponentBuildSummary[] = [];

    for (let i = 0; i < componentIds.length; i += BATCH_SIZE) {
      const batch = componentIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((cid) => this.getComponentBuildSummary(jobId, cid)));
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          summaries.push(result.value);
        }
      }
    }
    return summaries;
  }

  /**
   * try to detect the workspace owner from workspace.jsonc in cwd.
   */
  getDefaultOwner(): string | undefined {
    try {
      const raw = readFileSync(join(process.cwd(), 'workspace.jsonc'), 'utf8');
      const match = raw.match(/"defaultScope"\s*:\s*"([^"]+)"/);
      if (!match) return undefined;
      const defaultScope = match[1];
      if (!defaultScope.includes('.')) return undefined;
      return defaultScope.split('.')[0];
    } catch {
      return undefined;
    }
  }

  getJobUrl(job: RippleJob): string {
    if (job.laneId) {
      // laneId format: "scope/lane-name", e.g. "att-bit.duc/my-lane"
      const [scope, ...laneParts] = job.laneId.split('/');
      const laneName = laneParts.join('/');
      if (scope && laneName) {
        return `https://${getCloudDomain()}/${scope.replace('.', '/')}/~lane/${laneName}/~ripple-ci/job/${job.id}`;
      }
    }
    return `https://${getCloudDomain()}/ripple-ci/job/${job.id}`;
  }

  static async provider([cli, cloud, loggerAspect]: [CLIMain, CloudMain, LoggerMain]) {
    const logger = loggerAspect.createLogger(RippleAspect.id);
    const ripple = new RippleMain(cloud, logger);

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

/**
 * extract the owner (org) from a job's laneId. laneId format: "owner.scope/lane-name"
 */
export function getOwnerFromJob(job: RippleJob): string | undefined {
  if (!job.laneId) return undefined;
  const scope = job.laneId.split('/')[0];
  if (!scope?.includes('.')) return scope;
  return scope.split('.')[0];
}
