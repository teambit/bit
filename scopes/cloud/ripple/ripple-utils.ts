import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
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

/**
 * resolve a job ID from explicit argument, --lane flag, or auto-detected workspace lane.
 * when no jobId is given, finds the latest job for the lane and optionally validates its phase.
 */
export async function resolveJobId(
  ripple: RippleMain,
  jobId: string | undefined,
  flags: { lane?: string },
  opts?: { allowedPhases?: string[]; actionVerb?: string }
): Promise<{ id: string } | { error: string }> {
  if (jobId) return { id: jobId };
  const laneId = flags.lane || ripple.getCurrentLaneId();
  if (!laneId) {
    return {
      error: 'Could not find a Ripple CI job. Provide a job ID, use --lane, or run from a workspace on a lane.',
    };
  }
  const found = await ripple.findLatestJobForLane(laneId);
  if (!found) {
    return { error: `No Ripple CI job found for lane "${laneId}".` };
  }
  if (opts?.allowedPhases) {
    const phase = found.status?.phase?.toUpperCase();
    if (!opts.allowedPhases.includes(phase || '')) {
      const verb = opts.actionVerb || 'act on';
      return {
        error: `Latest job for lane "${laneId}" is ${found.status?.phase || 'unknown'} (${found.id}), cannot ${verb}. Provide a specific job ID.`,
      };
    }
  }
  return { id: found.id };
}
