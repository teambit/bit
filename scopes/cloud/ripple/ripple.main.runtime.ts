import type { RuntimeDefinition } from '@teambit/harmony';
import { CLIAspect, type CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, type LoggerMain, type Logger } from '@teambit/logger';
import { CloudAspect, type CloudMain } from '@teambit/cloud';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { getCloudDomain } from '@teambit/legacy.constants';
import { fetchWithAgent } from '@teambit/scope.network';
import { readLastExport, type LastExportData } from '@teambit/export';
import { stripComponentVersion } from './ripple-utils';
import stripAnsi from 'strip-ansi';
import { RippleAspect } from './ripple.aspect';
import {
  RippleCmd,
  RippleListCmd,
  RippleLogCmd,
  RippleErrorsCmd,
  RippleRetryCmd,
  RippleStopCmd,
  RippleSimulateCmd,
} from './ripple.cmd';

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

/**
 * where Ripple CI looks for dependents of the lane components when simulating. the server can't resolve
 * the dependents graph without a positive search base, so the caller always sets `scopeIds` or `ownerIds`.
 */
export type SimulateNetwork = {
  scopeIds?: string[];
  ownerIds?: string[];
  excludeScopeIds?: string[];
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

  private static SIMULATE_LANE = `
    mutation simulateLane($laneId: String, $options: SimulateLaneOptions) {
      simulateLane(laneId: $laneId, options: $options) {
        id
        slug
        name
        laneId
        simulation
        status { startedAt finishedAt phase }
      }
    }
  `;

  /**
   * the same lookup as GET_JOB_BY_SLUG without the two CI graph blobs, which the simulate flow never reads.
   * a simulation is a wide dependents fan-out, so those blobs are unbounded and the poll can run 3 times.
   */
  private static GET_JOB_BY_SLUG_MINIMAL = `
    query getJobBySlug($slug: ID!) {
      getJob(slug: $slug) {
        id
        slug
        name
        laneId
        simulation
        status { startedAt finishedAt phase }
      }
    }
  `;

  /** how many times to look the persisted job up, and the backoff between the attempts */
  private static JOB_LOOKUP_ATTEMPTS = 3;
  private static JOB_LOOKUP_DELAY_MS = 200;

  private ensureAuthenticated(): void {
    if (!this.cloud.getAuthToken()) {
      throw new Error('You are not logged in. Please run "bit login" first.');
    }
  }

  /**
   * every Ripple CI GraphQL request goes through this, so it honors the configured proxy, CA and network
   * settings, the same way the cloud aspect reaches bit.cloud. kept as a field so tests can replace it:
   * the agent-wrapped fetcher doesn't go through the global fetch.
   * the log-streaming endpoint (`getContainerLog`) deliberately stays on the global fetch - it reads the
   * response as a web stream (`body.getReader()`), which the agent-wrapped node-fetch response doesn't have.
   */
  private fetcher: typeof fetchWithAgent = fetchWithAgent;

  private async fetchRippleGQL<T>(query: string, variables?: Record<string, any>): Promise<T | null> {
    this.ensureAuthenticated();
    const graphqlUrl = `${this.cloud.getCloudApi()}/graphql`;
    const body = JSON.stringify({ query, variables });
    const headers = {
      'Content-Type': 'application/json',
      ...this.cloud.getAuthHeader(),
    };
    const response = await this.fetcher(graphqlUrl, { method: 'POST', headers, body });
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
   * looks for common error markers in the build output and returns from the *earliest* one
   * to the end, so the whole error block is shown starting at where it began.
   */
  extractErrorsFromLog(messages: string[]): string[] {
    // markers that denote the start of a real error section. most are matched
    // case-insensitively; the named-Error marker is intentionally case-sensitive so it
    // catches "TypeError:" / "ReferenceError:" at line start or after whitespace without
    // matching serialized props such as "isUserError: true" (a common tail of a stringified
    // error object) — matching that would slice from the very end and drop the real error
    // printed above it.
    const markers: RegExp[] = [
      /errors were found/i,
      /failed task/i,
      /threw an error/i,
      /responded with the following error/i,
      /unable to find object/i,
      /\berror:/i,
      /(^|\s)[A-Z]\w*Error:/,
      /\bfail\b/i,
    ];
    // pick the earliest line matching any marker (not the first marker in the list) so an
    // incidental late match can't truncate the error that appeared earlier in the log.
    const startIdx = messages.findIndex((m) => {
      const clean = stripAnsi(m);
      return markers.some((re) => re.test(clean));
    });
    if (startIdx >= 0) {
      return messages.slice(startIdx);
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
   * start a simulation job for a lane. Ripple CI builds the dependents of the lane components (searched in
   * the given network of scopes/owners) against the lane heads, without merging or publishing anything.
   * the schema also accepts an `incrementStrategy`, but a simulation publishes nothing so it's not exposed
   * and the server default is used.
   * `options.network` is always sent (empty when no filter is given): the schema marks `options` as
   * optional, but the resolver reads `options.network` unconditionally and fails when it's omitted.
   */
  async simulateLane(laneId: string, network?: SimulateNetwork): Promise<RippleJob | null> {
    const filters = Object.entries(network || {}).filter(([, values]) => values?.length);
    const options = { network: Object.fromEntries(filters) };
    const data = await this.fetchRippleGQL<{ simulateLane: RippleJob }>(RippleMain.SIMULATE_LANE, {
      laneId,
      options,
    });
    const job = data?.simulateLane;
    if (!job) return null;
    // the mutation returns the job before it's persisted: only the slug is set, id and status are null.
    // fetch the persisted job so callers get the real id, which "ripple log/errors" need.
    if (!job.id && job.slug) return (await this.getPersistedJobBySlug(job.slug)) ?? job;
    return job;
  }

  /**
   * poll for the persisted job: the simulate mutation responds before the job is written, so a single
   * immediate lookup can still come back empty. the delay doubles between the attempts, to cover more
   * server lag with the same number of requests. returns null once the budget is spent - the simulation is
   * already running by then, so the caller reports it without an id rather than failing the command.
   */
  private async getPersistedJobBySlug(slug: string): Promise<RippleJob | null> {
    for (let attempt = 1; attempt <= RippleMain.JOB_LOOKUP_ATTEMPTS; attempt += 1) {
      const data = await this.fetchRippleGQL<{ getJob: RippleJob }>(RippleMain.GET_JOB_BY_SLUG_MINIMAL, {
        slug,
      }).catch((err: Error) => {
        this.logger.debug(`simulateLane: lookup of job "${slug}" failed on attempt ${attempt}: ${err.message}`);
        return null;
      });
      if (data?.getJob?.id) return data.getJob;
      if (attempt < RippleMain.JOB_LOOKUP_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RippleMain.JOB_LOOKUP_DELAY_MS * 2 ** (attempt - 1)));
      }
    }
    this.logger.debug(`simulateLane: job "${slug}" was not persisted after ${RippleMain.JOB_LOOKUP_ATTEMPTS} lookups`);
    return null;
  }

  /**
   * whether the current lane was exported at least once. undefined when not on a lane / no workspace.
   */
  isCurrentLaneExported(): boolean | undefined {
    if (!this.workspace || !this.getCurrentLaneId()) return undefined;
    return this.workspace.consumer.bitMap.isLaneExported;
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
      new RippleSimulateCmd(ripple),
    ];
    cli.register(rippleCmd);

    return ripple;
  }
}

RippleAspect.addRuntime(RippleMain);
