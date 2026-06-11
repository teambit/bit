import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatTitle, formatItem, formatHint, joinSections } from '@teambit/cli';
import type { Component } from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import type { LoadTrace } from '@teambit/harmony.modules.load-trace';
import { startOrJoinLoadTrace, currentLoadTrace } from '@teambit/harmony.modules.load-trace';
import { EnvsAspect } from '@teambit/envs';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ExtensionsOrigin, Workspace } from './workspace';

/** strip the version suffix from a raw id string (ids here are raw `stringId`s, not ComponentIDs). */
const noVersion = (id: string) => id.split('@')[0];

type ExtensionSourceRow = {
  extensionId: string;
  winner: ExtensionsOrigin;
  alsoIn: ExtensionsOrigin[];
};

type DebugLoadData = {
  id: string;
  trace?: Record<string, any>;
  extensionSources: ExtensionSourceRow[];
  envId?: string;
  envOrigin?: ExtensionsOrigin;
  issues: Array<{ type: string; description: string; data: any }>;
};

export class DebugLoadCmd implements Command {
  name = 'debug-load <component-id>';
  group = 'info-analysis';
  description = 'EXPERIMENTAL. load a component with tracing enabled and explain how it was loaded';
  extendedDescription = `clears the component's caches and loads it fresh, then prints: the load stages with timings and
cache hits/misses, the sources that contributed each extension (and which one won the merge),
the resolved env and which source determined it, and any load issues found.`;
  arguments = [{ name: 'component-id', description: 'the component id to load' }];
  alias = '';
  options = [['j', 'json', 'return the load trace in json format']] as CommandOptions;
  loader = true;
  private = true;

  constructor(private workspace: Workspace) {}

  async report([idStr]: [string]): Promise<string> {
    const data = await this.gatherData(idStr);
    const sections = [
      this.renderStagesSection(data),
      this.renderExtensionSourcesSection(data),
      this.renderEnvSection(data),
      this.renderIssuesSection(data),
    ];
    return joinSections(sections);
  }

  async json([idStr]: [string]): Promise<DebugLoadData> {
    return this.gatherData(idStr);
  }

  private async gatherData(idStr: string): Promise<DebugLoadData> {
    const componentId = await this.workspace.resolveComponentId(idStr);
    // ignoreVersion is needed because workspace ids carry versions while the resolved id may not
    if (!this.workspace.hasId(componentId, { ignoreVersion: true })) {
      throw new BitError(`unable to find "${idStr}" in the workspace. debug-load works on workspace components only`);
    }
    // a debug command must not report a cache-hit no-op, so load fresh
    await this.workspace.clearComponentCache(componentId);

    let trace: LoadTrace | undefined;
    const component: Component = await startOrJoinLoadTrace('debug-load', { id: componentId.toString() }, async () => {
      trace = currentLoadTrace();
      return this.workspace.get(componentId);
    });

    const componentFromScope = await this.workspace.scope.get(componentId);
    const mergeRes = await this.workspace.componentExtensions(componentId, componentFromScope, undefined, {
      loadExtensions: false,
    });

    const extensionSources = this.buildExtensionSources(mergeRes.extensions, mergeRes.beforeMerge);
    // the merge returns an envId only when set via the envs aspect config. when the env is set as
    // a direct extension (e.g. via variants) or not set at all, take it from the loaded
    // component's envs data, and attribute it by searching the merge sources for it.
    const envFromLoad = component.state.aspects.get(EnvsAspect.id)?.data?.id;
    const envId = mergeRes.envId || envFromLoad;
    const envOrigin = this.findEnvOrigin(mergeRes.beforeMerge, envId);

    return {
      id: component.id.toString(),
      trace: trace?.rootSpan.toObject(),
      extensionSources,
      envId,
      envOrigin,
      issues: component.state.issues.toObject(),
    };
  }

  /**
   * for every extension in the final (merged) list, find which origins contributed it. the merge
   * gives precedence to the origin that appears first (the order of `beforeMerge`).
   */
  private buildExtensionSources(
    merged: ExtensionDataList,
    beforeMerge: Array<{ extensions: ExtensionDataList; origin: ExtensionsOrigin; extraData: any }>
  ): ExtensionSourceRow[] {
    return merged.map((mergedExt) => {
      const extId = mergedExt.stringId;
      const origins = beforeMerge
        .filter((entry) => entry.extensions.some((ext) => noVersion(ext.stringId) === noVersion(extId)))
        .map((entry) => entry.origin);
      return {
        extensionId: extId,
        winner: origins[0],
        alsoIn: origins.slice(1),
      };
    });
  }

  /**
   * the env is taken from the EnvsAspect entry of the merged extensions. the origin that
   * determined it is the first origin (in precedence order) that sets an env.
   */
  private findEnvOrigin(
    beforeMerge: Array<{ extensions: ExtensionDataList; origin: ExtensionsOrigin; extraData: any }>,
    envId?: string
  ): ExtensionsOrigin | undefined {
    if (!envId) return undefined;
    const found = beforeMerge.find((entry) => {
      const envsAspect = entry.extensions.findCoreExtension(EnvsAspect.id);
      if (envsAspect?.config.env && noVersion(envsAspect.config.env) === noVersion(envId)) return true;
      // the env may also appear directly as an extension entry of that origin
      return entry.extensions.some((ext) => noVersion(ext.stringId) === noVersion(envId));
    });
    return found?.origin;
  }

  private renderStagesSection(data: DebugLoadData): string {
    if (!data.trace) return '';
    const lines: string[] = [];
    const renderSpan = (span: Record<string, any>, depth: number) => {
      const duration = span.durationMs !== undefined ? chalk.cyan(`${span.durationMs}ms`) : formatHint('n/a');
      const attrs = span.attributes ? formatHint(` ${JSON.stringify(span.attributes)}`) : '';
      lines.push(`   ${'  '.repeat(depth)}${span.name} ${duration}${attrs}`);
      (span.children || []).forEach((child: Record<string, any>) => renderSpan(child, depth + 1));
    };
    renderSpan(data.trace, 0);
    return [formatTitle('load stages (timings and cache hits)'), ...lines].join('\n');
  }

  private renderExtensionSourcesSection(data: DebugLoadData): string {
    if (!data.extensionSources.length) return '';
    const items = data.extensionSources.map((row) => {
      const alsoIn = row.alsoIn.length ? formatHint(` (also in: ${row.alsoIn.join(', ')})`) : '';
      return formatItem(`${row.extensionId} ${formatHint('from')} ${chalk.green(row.winner)}${alsoIn}`);
    });
    return [formatTitle(`extension sources (${items.length})`), ...items].join('\n');
  }

  private renderEnvSection(data: DebugLoadData): string {
    const origin = data.envOrigin || 'computed during load (not set in config)';
    const envLine = data.envId
      ? formatItem(`${chalk.cyan(data.envId)} ${formatHint('determined by')} ${chalk.green(origin)}`)
      : formatItem(formatHint('no env configured'));
    return [formatTitle('environment'), envLine].join('\n');
  }

  private renderIssuesSection(data: DebugLoadData): string {
    if (!data.issues.length) {
      return [formatTitle('load issues'), formatItem(formatHint('none'))].join('\n');
    }
    const items = data.issues.map((issue) =>
      formatItem(`${chalk.yellow(issue.type)}: ${issue.description} ${formatHint(JSON.stringify(issue.data))}`)
    );
    return [formatTitle(`load issues (${items.length})`), ...items].join('\n');
  }
}
