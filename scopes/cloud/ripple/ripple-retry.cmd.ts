import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { RippleMain } from './ripple.main.runtime';

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

  private async resolveJobId(
    jobId: string | undefined,
    flags: { lane?: string }
  ): Promise<{ id: string } | { error: string }> {
    if (jobId) return { id: jobId };
    const laneId = flags.lane || this.ripple.getCurrentLaneId();
    if (!laneId) {
      return {
        error: 'Could not find a Ripple CI job. Provide a job ID, use --lane, or run from a workspace on a lane.',
      };
    }
    const found = await this.ripple.findLatestJobForLane(laneId);
    if (!found) {
      return { error: `No Ripple CI job found for lane "${laneId}".` };
    }
    const phase = found.status?.phase?.toUpperCase();
    if (phase !== 'FAILURE' && phase !== 'FAILED') {
      return {
        error: `Latest job for lane "${laneId}" is ${found.status?.phase || 'unknown'} (${found.id}), not failed. Provide a specific job ID to retry.`,
      };
    }
    return { id: found.id };
  }

  async report([jobId]: [string], flags: { lane?: string }) {
    const resolved = await this.resolveJobId(jobId, flags);
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
    const resolved = await this.resolveJobId(jobId, flags);
    if ('error' in resolved) return { error: resolved.error };
    const result = await this.ripple.retryJob(resolved.id);
    return { job: result };
  }
}
