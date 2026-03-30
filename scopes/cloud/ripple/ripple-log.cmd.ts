import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import Table from 'cli-table';
import type { RippleMain } from './ripple.main.runtime';
import { colorPhase } from './ripple-utils';

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
        const icon =
          node.phase === 'FAILURE' ? chalk.red('✗') : node.phase === 'SUCCESS' ? chalk.green('✓') : chalk.yellow('○');
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
