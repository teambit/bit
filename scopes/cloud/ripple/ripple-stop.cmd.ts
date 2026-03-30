import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { RippleMain } from './ripple.main.runtime';
import { resolveJobId } from './ripple-utils';

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
