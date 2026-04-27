import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import type { LastExportData } from '@teambit/export';
import type { RippleMain } from './ripple.main.runtime';

export { stripAnsi };

export function colorPhase(phase?: string): string {
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

export function isFailedPhase(phase?: string): boolean {
  const p = phase?.toUpperCase();
  return p === 'FAILURE' || p === 'FAILED';
}

/**
 * strip "@hash" or "@version" suffix from a component ID.
 * e.g. "scope/name@abc123" → "scope/name"
 */
export function stripComponentVersion(id: string): string {
  const atIdx = id.indexOf('@');
  return atIdx > 0 ? id.substring(0, atIdx) : id;
}

export type ResolveSource = 'arg' | 'lane' | 'last-export';

export type ResolvedJobId = { id: string; source: ResolveSource; lastExport?: LastExportData } | { error: string };

/**
 * resolve a job ID from explicit argument, --lane flag, current workspace lane, or the
 * last-export.json written by the export command (used when on main).
 * when opts.allowedPhases is set, the resolved job's phase is validated.
 */
export async function resolveJobId(
  ripple: RippleMain,
  jobId: string | undefined,
  flags: { lane?: string },
  opts?: { allowedPhases?: string[]; actionVerb?: string }
): Promise<ResolvedJobId> {
  if (jobId) return { id: jobId, source: 'arg' };

  const laneId = flags.lane || ripple.getCurrentLaneId();
  if (laneId) {
    const found = await ripple.findLatestJobForLane(laneId);
    if (!found) {
      return { error: `No Ripple CI job found for lane "${laneId}".` };
    }
    const phaseError = checkPhase(found, opts, `Latest job for lane "${laneId}"`);
    if (phaseError) return { error: phaseError };
    return { id: found.id, source: 'lane' };
  }

  const lastExport = await ripple.getLastExport();
  if (lastExport?.rippleJobs?.length) {
    const slug = lastExport.rippleJobs[lastExport.rippleJobs.length - 1];
    const job = await ripple.getJobBySlug(slug);
    if (!job) {
      return { error: `Could not find Ripple CI job for your last export "${slug}".` };
    }
    const phaseError = checkPhase(job, opts, 'Last export job');
    if (phaseError) return { error: phaseError };
    return { id: job.id, source: 'last-export', lastExport };
  }

  return {
    error:
      'Could not find a Ripple CI job. Provide a job ID, use --lane, or run from a workspace with a recent export.',
  };
}

function checkPhase(
  job: { id: string; status?: { phase?: string } },
  opts: { allowedPhases?: string[]; actionVerb?: string } | undefined,
  contextLabel: string
): string | null {
  if (!opts?.allowedPhases) return null;
  const phase = job.status?.phase?.toUpperCase();
  if (opts.allowedPhases.includes(phase || '')) return null;
  const verb = opts.actionVerb || 'act on';
  return `${contextLabel} is ${job.status?.phase || 'unknown'} (${job.id}), cannot ${verb}. Provide a specific job ID.`;
}

/**
 * format a relative time delta (e.g. "2 minutes ago", "3 days ago") for a contextual header.
 */
export function formatAge(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
