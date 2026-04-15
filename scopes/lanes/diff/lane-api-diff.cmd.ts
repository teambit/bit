import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { LanesMain } from '@teambit/lanes';
import type { SchemaMain } from '@teambit/schema';
import type { ComponentMain } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { computeAPIDiff, APIDiffStatus } from '@teambit/semantics.entities.semantic-schema-diff';
import type { APIDiffResult, APIDiffChange } from '@teambit/semantics.entities.semantic-schema-diff';

export class LaneApiDiffCmd implements Command {
  name = 'api-diff <component>';
  description = 'show API changes for a lane component compared to main';
  extendedDescription = `compares the public API schema of a component on a lane against its version on main.
by default uses the current lane. use --lane to specify a different lane.

examples:
  bit lane api-diff my-component
  bit lane api-diff my-component --lane my-scope/my-lane`;
  alias = '';
  options = [
    ['l', 'lane <lane-name>', 'lane to compare against main (defaults to current lane)'],
    ['j', 'json', 'return the API diff in json format'],
  ] as CommandOptions;
  loader = true;

  constructor(
    private lanes: LanesMain,
    private schema: SchemaMain,
    private component: ComponentMain,
    private workspace: Workspace | undefined,
    private scope: ScopeMain
  ) {}

  async report([componentPattern]: [string], { lane }: { lane?: string }): Promise<string> {
    const { diff, componentId, fromLabel, toLabel } = await this.computeDiff(componentPattern, lane);
    return this.formatDiffResult(diff, `${componentId} (${fromLabel} → ${toLabel})`);
  }

  async json([componentPattern]: [string], { lane }: { lane?: string }): Promise<Record<string, any>> {
    const { diff, componentId, fromLabel, toLabel } = await this.computeDiff(componentPattern, lane);
    return {
      componentId,
      baseVersion: fromLabel,
      compareVersion: toLabel,
      ...diff,
    };
  }

  private async computeDiff(
    pattern: string,
    laneName?: string
  ): Promise<{ diff: APIDiffResult; componentId: string; fromLabel: string; toLabel: string }> {
    const laneId = laneName ? await this.lanes.parseLaneId(laneName) : this.lanes.getCurrentLaneId();

    if (laneId.isDefault()) {
      throw new Error('api-diff requires being on a lane or specifying one with --lane');
    }

    const host = this.component.getHost();
    const ids = await host.idsByPattern(pattern, true);
    if (ids.length === 0) throw new Error(`no components found matching "${pattern}"`);
    if (ids.length > 1)
      throw new Error(`pattern "${pattern}" matches ${ids.length} components. please specify a single component.`);

    const componentId = ids[0];

    const laneObj = await this.lanes.loadLane(laneId);
    if (!laneObj) throw new Error(`unable to find lane "${laneId.toString()}"`);

    const laneComp = laneObj.components.find((c) => c.id.isEqualWithoutVersion(componentId));
    if (!laneComp)
      throw new Error(`component ${componentId.toStringWithoutVersion()} is not on lane "${laneId.toString()}"`);
    const laneHead = laneComp.head.toString();

    const modelComponent = await this.scope.legacyScope.getModelComponent(componentId);
    const mainHead = modelComponent.head?.toString();
    if (!mainHead) throw new Error(`component ${componentId.toStringWithoutVersion()} has no version on main`);
    if (laneHead === mainHead) {
      throw new Error(`component ${componentId.toStringWithoutVersion()} has the same version on lane and main`);
    }

    const baseId = componentId.changeVersion(mainHead);
    const compareId = componentId.changeVersion(laneHead);
    const [baseComponent, compareComponent] = await host.getMany([baseId, compareId]);
    if (!baseComponent) throw new Error(`could not load ${baseId.toString()}`);
    if (!compareComponent) throw new Error(`could not load ${compareId.toString()}`);

    const [baseSchema, compareSchema] = await Promise.all([
      this.schema.getSchema(baseComponent),
      this.schema.getSchema(compareComponent),
    ]);

    const assessor = this.schema.getImpactAssessor();
    const diff = computeAPIDiff(baseSchema, compareSchema, assessor);

    return {
      diff,
      componentId: componentId.toStringWithoutVersion(),
      fromLabel: `main@${mainHead.slice(0, 8)}`,
      toLabel: `${laneId.name}@${laneHead.slice(0, 8)}`,
    };
  }

  private formatDiffResult(diff: APIDiffResult, label: string): string {
    if (!diff.hasChanges) {
      return chalk.green(`\n  No API changes detected for ${label}\n`);
    }

    const lines: string[] = [''];
    lines.push(`  ${chalk.bold('API Diff')} for ${chalk.cyan(label)}`);
    lines.push('');

    const parts: string[] = [];
    if (diff.added > 0) parts.push(chalk.green(`${diff.added} added`));
    if (diff.removed > 0) parts.push(chalk.red(`${diff.removed} removed`));
    if (diff.modified > 0) parts.push(chalk.yellow(`${diff.modified} modified`));
    if (parts.length > 0) lines.push(`  ${parts.join(chalk.dim(' · '))}`);
    lines.push('');

    this.formatSection(lines, 'Public API', diff.publicChanges);
    this.formatSection(lines, 'Internal (non-exported)', diff.internalChanges);

    return lines.join('\n');
  }

  private formatSection(lines: string[], title: string, changes: APIDiffChange[]): void {
    if (changes.length === 0) return;
    lines.push(`  ${chalk.bold.underline(title)}`);
    lines.push('');
    for (const change of changes) {
      const prefix =
        change.status === APIDiffStatus.ADDED
          ? chalk.green.bold('+')
          : change.status === APIDiffStatus.REMOVED
            ? chalk.red.bold('−')
            : chalk.yellow.bold('~');
      const name =
        change.status === APIDiffStatus.ADDED
          ? chalk.green(change.exportName)
          : change.status === APIDiffStatus.REMOVED
            ? chalk.red(change.exportName)
            : chalk.yellow(change.exportName);
      lines.push(`  ${prefix} ${name} ${chalk.dim(`(${change.schemaType})`)}`);
      if (change.changes) {
        for (const detail of change.changes) {
          lines.push(`    ${chalk.dim('●')} ${detail.description}`);
        }
      }
      lines.push('');
    }
  }
}
