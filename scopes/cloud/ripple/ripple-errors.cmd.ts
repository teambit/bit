import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { RippleMain, CiGraphNode } from './ripple.main.runtime';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

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

    const failedNodes = ciNodes.filter((n) => n.phase === 'FAILURE');
    const succeededNodes = ciNodes.filter((n) => n.phase === 'SUCCESS');
    const otherNodes = ciNodes.filter((n) => n.phase !== 'FAILURE' && n.phase !== 'SUCCESS');

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
            // strip ANSI codes and indent
            const clean = msg.replace(ANSI_REGEX, '');
            // skip stack trace lines (noisy) unless --log is used
            if (!flags.log && (clean.match(/^\s+at /) || clean.match(/^\s+at\s/))) continue;
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
    const failedNodes = ciNodes.filter((n) => n.phase === 'FAILURE');
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
    default:
      return chalk.yellow(phase);
  }
}
