import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import Table from 'cli-table';
import type { RippleMain, RippleJob, CiGraphNode } from './ripple.main.runtime';
import { colorPhase, isFailedPhase, stripAnsi, resolveJobId } from './ripple-utils';

export class RippleCmd implements Command {
  name = 'ripple <sub-command>';
  description = 'manage Ripple CI jobs on bit.cloud';
  extendedDescription = 'view, retry, and manage Ripple CI jobs that build your components in the cloud after export.';
  group = 'collaborate';
  skipWorkspace = true;
  remoteOp = true;

  options: CommandOptions = [];
  commands: Command[] = [];

  async report() {
    return { code: 1, data: '[ripple] please specify a subcommand. See --help for available commands.' };
  }
}

export class RippleListCmd implements Command {
  name = 'list';
  description = 'list recent Ripple CI jobs (filtered by workspace owner by default)';
  skipWorkspace = true;
  remoteOp = true;
  alias = '';

  options: CommandOptions = [
    ['', 'all', 'show jobs from all owners, not just the workspace owner'],
    ['o', 'owner <owner>', 'filter by organization (default: detected from workspace defaultScope)'],
    ['s', 'scope <scope>', 'filter by scope (e.g. "teambit.cloud")'],
    ['', 'lane <lane>', 'filter by lane ID (e.g. "scope/lane-name")'],
    ['u', 'user <user>', 'filter by username'],
    ['', 'status <status>', 'filter by status (e.g. SUCCESS, FAILURE, RUNNING)'],
    ['l', 'limit <limit>', 'max number of jobs to show (default: 20)'],
    ['j', 'json', 'return the output as JSON'],
  ];

  constructor(private ripple: RippleMain) {}

  async report(
    args: [],
    flags: {
      all?: boolean;
      owner?: string;
      scope?: string;
      lane?: string;
      user?: string;
      status?: string;
      limit?: string;
    }
  ) {
    const { jobs, ownerUsed } = await this.getFilteredJobs(flags);

    if (!jobs || jobs.length === 0) {
      let hint = '';
      if (flags.lane) hint = ` for lane "${flags.lane}"`;
      else if (flags.scope) hint = ` for scope "${flags.scope}"`;
      else if (ownerUsed) hint = ` for owner "${ownerUsed}"`;
      const tip = ownerUsed ? ' Use --all to see jobs from all owners.' : '';
      return chalk.yellow(`No Ripple CI jobs found${hint}.${tip}`);
    }

    const table = new Table({
      head: [
        chalk.cyan('Job ID'),
        chalk.cyan('Name'),
        chalk.cyan('Scope'),
        chalk.cyan('Status'),
        chalk.cyan('User'),
        chalk.cyan('Started'),
        chalk.cyan('Duration'),
      ],
      chars: {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '',
        'right-mid': '',
        middle: ' ',
      },
      style: { 'padding-left': 1, 'padding-right': 1 },
    });

    for (const job of jobs) {
      table.push([
        job.id,
        truncate(job.name || '-', 40),
        getScopeFromLaneId(job.laneId),
        colorPhase(job.status?.phase),
        job.user?.username || '-',
        formatDate(job.status?.startedAt),
        formatDuration(job.status?.startedAt, job.status?.finishedAt),
      ]);
    }

    const header = ownerUsed ? chalk.gray(`showing jobs for owner "${ownerUsed}" (use --all for all jobs)`) : '';
    return [header, table.toString()].filter(Boolean).join('\n');
  }

  async json(
    args: [],
    flags: {
      all?: boolean;
      owner?: string;
      scope?: string;
      lane?: string;
      user?: string;
      status?: string;
      limit?: string;
    }
  ) {
    const { jobs } = await this.getFilteredJobs(flags);
    return { jobs: jobs || [] };
  }

  private async getFilteredJobs(flags: {
    all?: boolean;
    owner?: string;
    scope?: string;
    lane?: string;
    user?: string;
    status?: string;
    limit?: string;
  }): Promise<{ jobs: RippleJob[]; ownerUsed?: string }> {
    const requestedLimit = flags.limit ? parseInt(flags.limit, 10) : 20;
    if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
      throw new Error(`Invalid --limit value "${flags.limit}". Expected a positive integer.`);
    }

    // build server-side filters
    const filters: { lanes?: string[]; owners?: string[]; scopes?: string[]; status?: string } = {};

    // determine owner for default filtering (skip when --lane or --scope is given explicitly)
    let ownerUsed: string | undefined;
    if (!flags.all && !flags.lane && !flags.scope) {
      ownerUsed = flags.owner || this.ripple.getDefaultOwner();
    } else if (flags.owner) {
      ownerUsed = flags.owner;
    }

    if (ownerUsed) filters.owners = [ownerUsed];
    if (flags.lane) filters.lanes = [flags.lane];
    if (flags.scope) filters.scopes = [flags.scope];
    if (flags.status) filters.status = flags.status.toUpperCase();

    // user filter is not supported server-side, so overfetch if needed
    const needsClientFilter = !!flags.user;
    const fetchLimit = needsClientFilter ? Math.max(requestedLimit * 5, 100) : requestedLimit;
    let jobs = await this.ripple.listJobs({ filters, limit: fetchLimit });

    // apply client-side filters for fields not supported by FilterOptions
    if (flags.user) {
      const userFilter = flags.user.toLowerCase();
      jobs = jobs.filter((j) => j.user?.username?.toLowerCase().includes(userFilter));
    }

    jobs = jobs.slice(0, requestedLimit);

    return { jobs, ownerUsed };
  }
}

export class RippleLogCmd implements Command {
  name = 'log [job-id]';
  description = 'show job details and component build task summaries (auto-detects current lane when no job-id given)';
  skipWorkspace = true;
  remoteOp = true;
  alias = '';

  options: CommandOptions = [
    ['', 'lane <lane>', 'lane ID to find the latest job for (default: detected from .bitmap)'],
    ['c', 'component <component>', 'show build tasks for a specific component (full component ID)'],
    ['j', 'json', 'return the output as JSON'],
  ];

  arguments = [{ name: 'job-id', description: 'the Ripple CI job ID (optional — auto-detects from current lane)' }];

  constructor(private ripple: RippleMain) {}

  private async resolveJob(jobId: string | undefined, flags: { lane?: string }) {
    if (jobId) {
      return this.ripple.getJob(jobId);
    }
    const laneId = flags.lane || this.ripple.getCurrentLaneId();
    if (!laneId) return null;
    const found = await this.ripple.findLatestJobForLane(laneId);
    return found ? this.ripple.getJob(found.id) : null;
  }

  async report([jobId]: [string], flags: { lane?: string; component?: string }) {
    const job = await this.resolveJob(jobId, flags);
    if (!job) {
      if (!jobId) {
        const laneId = flags.lane || this.ripple.getCurrentLaneId();
        if (laneId) {
          return chalk.red(`No Ripple CI job found for lane "${laneId}".`);
        }
        return chalk.red(
          'Could not find a Ripple CI job. Provide a job ID, use --lane, or run from a workspace on a lane.'
        );
      }
      return chalk.red(`Job "${jobId}" not found.`);
    }

    const lines: string[] = [];
    lines.push(chalk.bold('Job Details'));
    lines.push(`  ${chalk.cyan('ID:')}       ${job.id}`);
    if (job.name) lines.push(`  ${chalk.cyan('Name:')}     ${job.name}`);
    lines.push(`  ${chalk.cyan('Status:')}   ${colorPhase(job.status?.phase)}`);
    if (job.laneId) lines.push(`  ${chalk.cyan('Lane:')}     ${job.laneId}`);
    if (job.user?.displayName)
      lines.push(`  ${chalk.cyan('User:')}     ${job.user.displayName} (${job.user.username})`);
    if (job.status?.startedAt)
      lines.push(`  ${chalk.cyan('Started:')}  ${new Date(job.status.startedAt).toLocaleString()}`);
    if (job.status?.finishedAt)
      lines.push(`  ${chalk.cyan('Finished:')} ${new Date(job.status.finishedAt).toLocaleString()}`);
    const jobUrl = this.ripple.getJobUrl(job);
    lines.push(`  ${chalk.cyan('URL:')}      ${jobUrl}`);

    if (flags.component) {
      await this.appendComponentDetail(lines, job.id, flags.component);
    } else {
      this.appendComponentList(lines, job);
    }

    return lines.join('\n');
  }

  private async appendComponentDetail(lines: string[], jobId: string, componentId: string) {
    const summary = await this.ripple.getComponentBuildSummary(jobId, componentId);
    if (!summary) {
      lines.push('');
      lines.push(chalk.yellow(`No build summary found for component "${componentId}" in this job.`));
      return;
    }
    lines.push('');
    lines.push(chalk.bold(`Build Tasks for ${summary.name || componentId}`));
    if (!summary.tasks || summary.tasks.length === 0) {
      lines.push(chalk.gray('  No build tasks found.'));
      return;
    }
    const table = new Table({
      head: [chalk.cyan('Task'), chalk.cyan('Status'), chalk.cyan('Started'), chalk.cyan('Warnings')],
      chars: {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '',
        'right-mid': '',
        middle: ' ',
      },
      style: { 'padding-left': 1, 'padding-right': 1 },
    });
    for (const task of summary.tasks) {
      table.push([
        task.name || '-',
        colorPhase(task.status?.status),
        task.startTime ? new Date(task.startTime).toLocaleString() : '-',
        task.status?.warnings ? chalk.yellow(String(task.status.warnings)) : '0',
      ]);
    }
    lines.push(table.toString());
  }

  private appendComponentList(lines: string[], job: { ciGraph?: string }) {
    const ciNodes = this.ripple.getCiGraphNodes(job);
    if (ciNodes.length === 0) return;
    const totalComponents = ciNodes.reduce((sum, n) => sum + n.componentIds.length, 0);
    lines.push('');
    lines.push(chalk.bold(`Components (${totalComponents})`));
    lines.push(chalk.gray('  Use --component <id> to see build tasks for a specific component'));
    let shown = 0;
    for (const node of ciNodes) {
      if (shown >= 30) {
        lines.push(chalk.gray(`  ... and ${totalComponents - shown} more`));
        break;
      }
      for (const compId of node.componentIds) {
        if (shown >= 30) break;
        const icon = isFailedPhase(node.phase)
          ? chalk.red('✗')
          : node.phase === 'SUCCESS'
            ? chalk.green('✓')
            : chalk.yellow('○');
        lines.push(`  ${icon} ${compId}`);
        shown++;
      }
    }
  }

  async json([jobId]: [string], flags: { lane?: string; component?: string }) {
    const job = await this.resolveJob(jobId, flags);
    if (flags.component && job) {
      const summary = await this.ripple.getComponentBuildSummary(job.id, flags.component);
      return { job, componentBuild: summary };
    }
    return { job };
  }
}

export class RippleErrorsCmd implements Command {
  name = 'errors [job-id]';
  description = 'show build errors for a Ripple CI job (auto-detects current lane when no job-id given)';
  skipWorkspace = true;
  remoteOp = true;
  alias = '';

  options: CommandOptions = [
    ['', 'lane <lane>', 'lane ID to find the latest failed job for (default: detected from .bitmap)'],
    ['', 'log', 'show full build log for failed containers (not just the error summary)'],
    ['j', 'json', 'return the output as JSON'],
  ];

  arguments = [{ name: 'job-id', description: 'the Ripple CI job ID (optional — auto-detects from current lane)' }];

  constructor(private ripple: RippleMain) {}

  async report([jobId]: [string], flags: { lane?: string; log?: boolean }) {
    const { job, ciNodes } = await this.getErrors(jobId, flags);

    if (!job) {
      if (jobId) {
        return chalk.red(`Job "${jobId}" not found.`);
      }
      const laneId = flags.lane || this.ripple.getCurrentLaneId();
      if (laneId) {
        return chalk.red(`No failed Ripple CI job found for lane "${laneId}".`);
      }
      return chalk.red(
        'Could not find a Ripple CI job. Provide a job ID, use --lane, or run from a workspace on a lane.'
      );
    }

    const lines: string[] = [];
    lines.push(chalk.bold(`Ripple CI Errors — ${job.name || job.id}`));
    lines.push(`  ${chalk.cyan('Job ID:')} ${job.id}`);
    lines.push(`  ${chalk.cyan('Status:')} ${colorPhase(job.status?.phase)}`);
    if (job.laneId) lines.push(`  ${chalk.cyan('Lane:')}   ${job.laneId}`);
    lines.push(`  ${chalk.cyan('URL:')}    ${this.ripple.getJobUrl(job)}`);

    if (ciNodes.length === 0) {
      lines.push('');
      lines.push(chalk.yellow('Could not determine which components are in this job.'));
      return lines.join('\n');
    }

    const failedNodes = ciNodes.filter((n) => isFailedPhase(n.phase));
    const succeededNodes = ciNodes.filter((n) => n.phase === 'SUCCESS');
    const otherNodes = ciNodes.filter((n) => !isFailedPhase(n.phase) && n.phase !== 'SUCCESS');

    const totalComponents = ciNodes.reduce((sum, n) => sum + n.componentIds.length, 0);
    const failedComponents = failedNodes.flatMap((n) => n.componentIds);
    const blockedComponents = otherNodes.flatMap((n) => n.componentIds);

    if (failedComponents.length === 0) {
      if (job.status?.phase?.toUpperCase() === 'FAILURE') {
        lines.push('');
        lines.push(
          chalk.yellow(`${totalComponents} component(s) in this job — no individual component failures found.`)
        );
        lines.push(chalk.yellow('The failure may be in a pipeline-level step. Check the Ripple CI URL above.'));
      } else {
        lines.push('');
        lines.push(chalk.green(`All ${totalComponents} component(s) built successfully.`));
      }
      return lines.join('\n');
    }

    lines.push('');
    lines.push(chalk.red.bold(`${failedComponents.length} component(s) with build failures:`));

    // fetch all build logs in parallel
    const containerNames = failedNodes.map((n) => n.containerName);
    const logMap = await this.ripple.getContainerLogs(job.id, containerNames);

    for (const node of failedNodes) {
      const compList = node.componentIds.join(', ');
      lines.push('');
      lines.push(chalk.bold(`  ${compList}`));

      const logMessages = logMap.get(node.containerName);
      if (logMessages && logMessages.length > 0) {
        const errorLines = flags.log ? logMessages : this.ripple.extractErrorsFromLog(logMessages);
        if (errorLines.length > 0) {
          for (const msg of errorLines) {
            const clean = stripAnsi(msg);
            // skip stack trace lines (noisy) unless --log is used
            if (!flags.log && /^\s+at\s/.test(clean)) continue;
            if (clean.length > 0) {
              lines.push(`    ${clean}`);
            }
          }
        } else {
          lines.push(chalk.gray('    No error details found in build log.'));
        }
      } else {
        lines.push(chalk.gray('    Build log not available.'));
      }
    }

    if (blockedComponents.length > 0) {
      lines.push('');
      lines.push(chalk.yellow(`${blockedComponents.length} component(s) not built (blocked by failure):`));
      for (const compId of blockedComponents) {
        lines.push(`  ${chalk.yellow('○')} ${compId}`);
      }
    }

    if (succeededNodes.length > 0) {
      const succeededCount = succeededNodes.reduce((sum, n) => sum + n.componentIds.length, 0);
      lines.push('');
      lines.push(chalk.green(`${succeededCount} component(s) built successfully.`));
    }

    return lines.join('\n');
  }

  async json([jobId]: [string], flags: { lane?: string; log?: boolean }) {
    const { job, ciNodes } = await this.getErrors(jobId, flags);
    if (!job) return { error: 'No job found', job: null, ciNodes: [], containerLogs: {} };

    // fetch error logs for failed containers in parallel
    const failedNodes = ciNodes.filter((n) => isFailedPhase(n.phase));
    const containerNames = failedNodes.map((n) => n.containerName);
    const logMap = await this.ripple.getContainerLogs(job.id, containerNames);
    const containerLogs: Record<string, string[]> = {};
    for (const [name, messages] of logMap) {
      containerLogs[name] = flags.log ? messages : this.ripple.extractErrorsFromLog(messages);
    }

    return { job, ciNodes, containerLogs };
  }

  private async getErrors(
    jobId: string | undefined,
    flags: { lane?: string }
  ): Promise<{
    job: any;
    ciNodes: CiGraphNode[];
  }> {
    let job;

    if (jobId) {
      job = await this.ripple.getJob(jobId);
    } else {
      const laneId = flags.lane || this.ripple.getCurrentLaneId();
      if (!laneId) {
        return { job: null, ciNodes: [] };
      }
      const found = await this.ripple.findLatestJobForLane(laneId, 'FAILURE');
      job = found ? await this.ripple.getJob(found.id) : null;
    }

    if (!job) {
      return { job: null, ciNodes: [] };
    }

    // use ciGraph (internal graph) for job-specific build status per container/component
    const ciNodes = this.ripple.getCiGraphNodes(job);

    return { job, ciNodes };
  }
}

export class RippleRetryCmd implements Command {
  name = 'retry [job-id]';
  description = 'retry a failed Ripple CI job (auto-detects current lane when no job-id given)';
  skipWorkspace = true;
  remoteOp = true;
  alias = '';

  options: CommandOptions = [
    ['', 'lane <lane>', 'lane ID to find the latest job for (default: detected from .bitmap)'],
    ['j', 'json', 'return the output as JSON'],
  ];

  arguments = [
    { name: 'job-id', description: 'the Ripple CI job ID to retry (optional — auto-detects from current lane)' },
  ];

  constructor(private ripple: RippleMain) {}

  async report([jobId]: [string], flags: { lane?: string }) {
    const resolved = await resolveJobId(this.ripple, jobId, flags, {
      allowedPhases: ['FAILURE', 'FAILED'],
      actionVerb: 'retry',
    });
    if ('error' in resolved) return chalk.red(resolved.error);

    const result = await this.ripple.retryJob(resolved.id);
    if (!result) {
      return chalk.red(`Failed to retry job "${resolved.id}". Make sure the job exists and has failed.`);
    }
    const lines: string[] = [];
    lines.push(chalk.green(`Successfully retried job "${resolved.id}".`));
    if (result.id) lines.push(`  ${chalk.cyan('New Job ID:')} ${result.id}`);
    if (result.status?.phase) lines.push(`  ${chalk.cyan('Status:')}     ${result.status.phase}`);
    const jobUrl = this.ripple.getJobUrl(result);
    lines.push(`  ${chalk.cyan('URL:')}        ${jobUrl}`);
    return lines.join('\n');
  }

  async json([jobId]: [string], flags: { lane?: string }) {
    const resolved = await resolveJobId(this.ripple, jobId, flags, {
      allowedPhases: ['FAILURE', 'FAILED'],
      actionVerb: 'retry',
    });
    if ('error' in resolved) return { error: resolved.error };
    const result = await this.ripple.retryJob(resolved.id);
    return { job: result };
  }
}

export class RippleStopCmd implements Command {
  name = 'stop [job-id]';
  description = 'stop a running Ripple CI job (auto-detects current lane when no job-id given)';
  skipWorkspace = true;
  remoteOp = true;
  alias = '';

  options: CommandOptions = [
    ['', 'lane <lane>', 'lane ID to find the latest job for (default: detected from .bitmap)'],
    ['j', 'json', 'return the output as JSON'],
  ];

  arguments = [
    { name: 'job-id', description: 'the Ripple CI job ID to stop (optional — auto-detects from current lane)' },
  ];

  constructor(private ripple: RippleMain) {}

  async report([jobId]: [string], flags: { lane?: string }) {
    const resolved = await resolveJobId(this.ripple, jobId, flags, {
      allowedPhases: ['RUNNING', 'IN_PROGRESS', 'PROCESSING'],
      actionVerb: 'stop',
    });
    if ('error' in resolved) return chalk.red(resolved.error);

    const result = await this.ripple.stopJob(resolved.id);
    if (!result) {
      return chalk.red(`Failed to stop job "${resolved.id}". Make sure the job exists and is currently running.`);
    }
    return chalk.green(`Successfully stopped job "${resolved.id}".`);
  }

  async json([jobId]: [string], flags: { lane?: string }) {
    const resolved = await resolveJobId(this.ripple, jobId, flags, {
      allowedPhases: ['RUNNING', 'IN_PROGRESS', 'PROCESSING'],
      actionVerb: 'stop',
    });
    if ('error' in resolved) return { error: resolved.error };
    const result = await this.ripple.stopJob(resolved.id);
    return { job: result };
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function formatDuration(startedAt?: string, finishedAt?: string): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 0) return '-';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getScopeFromLaneId(laneId?: string): string {
  if (!laneId) return '-';
  return laneId.split('/')[0] || '-';
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.substring(0, max - 1)}…`;
}
