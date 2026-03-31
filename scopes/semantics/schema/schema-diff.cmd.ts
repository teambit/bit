import chalk from 'chalk';
import type { Command, CommandOptions, CLIArgs } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
import type { Logger } from '@teambit/logger';
import { computeAPIDiff, APIDiffStatus } from '@teambit/semantics.entities.semantic-schema-diff';
import type { APIDiffResult, APIDiffChange, ImpactLevel } from '@teambit/semantics.entities.semantic-schema-diff';
import type { SchemaMain } from './schema.main.runtime';

export class SchemaDiffCommand implements Command {
  name = 'diff <component> <base-version> <compare-version>';
  description = 'show API changes between two versions of a component';
  extendedDescription = `compares the public API schema between two versions of a component.
shows added, removed, and modified exports with semantic impact analysis.

examples:
  bit schema diff my-component 0.0.1 0.0.2`;
  group = 'info-analysis';
  options = [['j', 'json', 'return the API diff in json format']] as CommandOptions;

  constructor(
    private schema: SchemaMain,
    private component: ComponentMain,
    private logger: Logger
  ) {}

  async report(args: CLIArgs): Promise<string> {
    const [pattern, baseVersion, compareVersion] = args as string[];
    const { diff, componentId } = await this.computeDiff(pattern, baseVersion, compareVersion);
    return this.formatDiffResult(diff, `${componentId} (${baseVersion} → ${compareVersion})`);
  }

  async json(args: CLIArgs): Promise<Record<string, any>> {
    const [pattern, baseVersion, compareVersion] = args as string[];
    const { diff, componentId } = await this.computeDiff(pattern, baseVersion, compareVersion);
    return this.toAgentJson(diff, componentId, baseVersion, compareVersion);
  }

  private async computeDiff(
    pattern: string,
    baseVersion: string,
    compareVersion: string
  ): Promise<{ diff: APIDiffResult; componentId: string }> {
    const host = this.component.getHost();
    const ids = await host.idsByPattern(pattern, true);

    if (ids.length === 0) {
      throw new Error(`no components found matching "${pattern}"`);
    }
    if (ids.length > 1) {
      throw new Error(`pattern "${pattern}" matches ${ids.length} components. please specify a single component.`);
    }

    const componentId = ids[0];
    const baseId = componentId.changeVersion(baseVersion);
    const compareId = componentId.changeVersion(compareVersion);

    const [baseComponent, compareComponent] = await host.getMany([baseId, compareId]);

    if (!baseComponent) throw new Error(`could not load ${baseId.toString()}`);
    if (!compareComponent) throw new Error(`could not load ${compareId.toString()}`);

    this.logger.debug(`computing API diff: ${baseId.toString()} -> ${compareId.toString()}`);

    const [baseSchema, compareSchema] = await Promise.all([
      this.schema.getSchema(baseComponent),
      this.schema.getSchema(compareComponent),
    ]);

    const assessor = this.schema.getImpactAssessor();
    const diff = computeAPIDiff(baseSchema, compareSchema, assessor);
    return { diff, componentId: componentId.toStringWithoutVersion() };
  }

  private toAgentJson(
    diff: APIDiffResult,
    componentId: string,
    baseVersion: string,
    compareVersion: string
  ): Record<string, any> {
    const serializeChange = (change: APIDiffChange) => ({
      status: change.status,
      impact: change.impact,
      exportName: change.exportName,
      schemaType: change.schemaType,
      ...(change.baseSignature ? { baseSignature: change.baseSignature } : {}),
      ...(change.compareSignature ? { compareSignature: change.compareSignature } : {}),
      ...(change.changes && change.changes.length > 0
        ? {
            details: change.changes.map((d) => ({
              changeKind: d.changeKind,
              description: d.description,
              impact: d.impact,
              context: d.context,
              ...(d.from !== undefined ? { from: d.from } : {}),
              ...(d.to !== undefined ? { to: d.to } : {}),
            })),
          }
        : {}),
    });

    return {
      componentId,
      baseVersion,
      compareVersion,
      hasChanges: diff.hasChanges,
      impact: diff.impact,
      summary: {
        added: diff.added,
        removed: diff.removed,
        modified: diff.modified,
        breaking: diff.breaking,
        nonBreaking: diff.nonBreaking,
        patch: diff.patch,
      },
      publicAPI: diff.publicChanges.map(serializeChange),
      internal: diff.internalChanges.map(serializeChange),
    };
  }

  private formatDiffResult(diff: APIDiffResult, pattern: string): string {
    if (!diff.hasChanges) {
      return chalk.green(`\n  No API changes detected for ${pattern}\n`);
    }

    const lines: string[] = [''];

    lines.push(`  ${chalk.bold('API Diff')} for ${chalk.cyan(pattern)}  ${this.impactBadge(diff.impact)}`);
    lines.push('');

    const parts: string[] = [];
    if (diff.added > 0) parts.push(chalk.green(`${diff.added} added`));
    if (diff.removed > 0) parts.push(chalk.red(`${diff.removed} removed`));
    if (diff.modified > 0) parts.push(chalk.yellow(`${diff.modified} modified`));
    const impactParts: string[] = [];
    if (diff.breaking > 0) impactParts.push(chalk.red.bold(`${diff.breaking} breaking`));
    if (diff.nonBreaking > 0) impactParts.push(chalk.green(`${diff.nonBreaking} non-breaking`));
    if (diff.patch > 0) impactParts.push(chalk.dim(`${diff.patch} patch`));
    lines.push(`  ${parts.join(chalk.dim(' · '))}  ${chalk.dim('|')}  ${impactParts.join(chalk.dim(' · '))}`);
    lines.push('');

    this.formatSection(lines, 'Public API', diff.publicChanges);
    this.formatSection(lines, 'Internal (non-exported)', diff.internalChanges);

    return lines.join('\n');
  }

  private formatSection(lines: string[], title: string, changes: APIDiffChange[]): void {
    if (changes.length === 0) return;
    lines.push(`  ${chalk.bold.underline(title)}`);
    lines.push('');
    for (const change of this.sortChanges(changes)) {
      lines.push(...this.formatChange(change));
    }
  }

  private sortChanges(changes: APIDiffChange[]): APIDiffChange[] {
    const order = { REMOVED: 0, MODIFIED: 1, ADDED: 2 };
    const impactOrder = { BREAKING: 0, NON_BREAKING: 1, PATCH: 2 };
    return [...changes].sort((a, b) => {
      const statusDiff = (order[a.status] ?? 3) - (order[b.status] ?? 3);
      if (statusDiff !== 0) return statusDiff;
      return (impactOrder[a.impact] ?? 3) - (impactOrder[b.impact] ?? 3);
    });
  }

  private formatChange(change: APIDiffChange): string[] {
    const lines: string[] = [];
    const indent = '    ';
    const impact = this.impactTag(change.impact);
    const kind = chalk.dim(`(${change.schemaType})`);

    switch (change.status) {
      case APIDiffStatus.ADDED:
        lines.push(`  ${chalk.green.bold('+')} ${chalk.green(change.exportName)} ${kind}  ${impact}`);
        if (change.compareSignature) {
          lines.push(`${indent}${chalk.dim(this.truncateSig(change.compareSignature))}`);
        }
        break;

      case APIDiffStatus.REMOVED:
        lines.push(`  ${chalk.red.bold('−')} ${chalk.red(change.exportName)} ${kind}  ${impact}`);
        if (change.baseSignature) {
          lines.push(`${indent}${chalk.dim.strikethrough(this.truncateSig(change.baseSignature))}`);
        }
        break;

      case APIDiffStatus.MODIFIED:
        lines.push(`  ${chalk.yellow.bold('~')} ${chalk.yellow(change.exportName)} ${kind}  ${impact}`);
        if (change.changes && change.changes.length > 0) {
          for (const detail of change.changes) {
            const detailImpact = this.impactDot(detail.impact);
            const desc = this.enhanceDescription(detail.description, detail.impact, detail.changeKind);
            lines.push(`${indent}${detailImpact} ${desc}`);
            if (detail.from && detail.to) {
              lines.push(`${indent}  ${chalk.red(`- ${detail.from}`)}`);
              lines.push(`${indent}  ${chalk.green(`+ ${detail.to}`)}`);
            }
          }
        }
        break;
    }

    lines.push('');
    return lines;
  }

  private static IMPACT_STYLES = {
    BREAKING: { badge: chalk.bgRed.white.bold(' BREAKING '), tag: chalk.red('breaking'), dot: chalk.red('●') },
    NON_BREAKING: {
      badge: chalk.bgGreen.white.bold(' NON-BREAKING '),
      tag: chalk.green('non-breaking'),
      dot: chalk.green('●'),
    },
    PATCH: { badge: chalk.bgBlue.white(' PATCH '), tag: chalk.dim('patch'), dot: chalk.dim('●') },
  };

  private impactBadge(impact: ImpactLevel): string {
    return SchemaDiffCommand.IMPACT_STYLES[impact].badge;
  }
  private impactTag(impact: ImpactLevel): string {
    return SchemaDiffCommand.IMPACT_STYLES[impact].tag;
  }
  private impactDot(impact: ImpactLevel): string {
    return SchemaDiffCommand.IMPACT_STYLES[impact].dot;
  }

  private static DESCRIPTION_ENHANCERS: Array<{
    match: (changeKind: string, impact: ImpactLevel) => boolean;
    enhance: (desc: string) => string;
  }> = [
    {
      match: (ck, i) => ck === 'return-type-changed' && i === 'NON_BREAKING',
      enhance: (d) => d.replace('return type changed:', 'return type widened:'),
    },
    {
      match: (ck, i) => ck === 'return-type-changed' && i === 'BREAKING',
      enhance: (d) => d.replace('return type changed:', 'return type narrowed:'),
    },
    {
      match: (ck, i) =>
        (ck === 'destructured-property-default-removed' || ck === 'parameter-default-removed') && i === 'BREAKING',
      enhance: (d) => (d.includes('breaking') ? d : `${d} — callers relying on the default will break`),
    },
  ];

  private enhanceDescription(description: string, impact: ImpactLevel, changeKind: string): string {
    const enhancer = SchemaDiffCommand.DESCRIPTION_ENHANCERS.find((e) => e.match(changeKind, impact));
    return enhancer ? enhancer.enhance(description) : description;
  }

  private truncateSig(sig: string, maxLen = 120): string {
    const oneLine = sig.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    if (oneLine.length <= maxLen) return oneLine;
    return `${oneLine.slice(0, maxLen - 3)}...`;
  }
}
