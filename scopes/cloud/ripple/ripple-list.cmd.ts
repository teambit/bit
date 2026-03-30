import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import Table from 'cli-table';
import type { RippleMain, RippleJob } from './ripple.main.runtime';

export class RippleListCmd implements Command {
  name = 'list';
  description = 'list recent Ripple CI jobs (filtered by workspace owner by default)';
  skipWorkspace = true;
  remoteOp = true;
  alias = '';

  options: CommandOptions = [
    ['', 'all', 'show jobs from all owners, not just the workspace owner'],
    ['o', 'owner <owner>', 'filter by organization name (default: detected from workspace.jsonc)'],
    ['s', 'scope <scope>', 'filter by scope (e.g. "teambit.cloud")'],
    ['', 'lane <lane>', 'filter by lane name'],
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
      return { jobs: [], ownerUsed: undefined };
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

function colorPhase(phase?: string): string {
  if (!phase) return chalk.yellow('unknown');
  switch (phase.toUpperCase()) {
    case 'SUCCESS':
      return chalk.green(phase);
    case 'FAILED':
    case 'FAILURE':
      return chalk.red(phase);
    case 'RUNNING':
    case 'IN_PROGRESS':
      return chalk.blue(phase);
    case 'STOPPED':
    case 'PAUSED':
      return chalk.gray(phase);
    default:
      return chalk.yellow(phase);
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
