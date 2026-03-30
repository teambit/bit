import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { RippleMain } from './ripple.main.runtime';
import { resolveJobId } from './ripple-utils';

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
