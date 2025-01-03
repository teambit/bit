import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import {
  SnapDataPerCompRaw,
  inputDataDescription,
  snapFromScopeOptions,
  SnapFromScopeOptions,
} from '@teambit/snapping';
import { compact } from 'lodash';
import { ApplyMain } from './apply.main.runtime';

type Options = {
  snap?: boolean;
  skipDependencyInstallation?: boolean;
} & SnapFromScopeOptions;

export class ApplyCmd implements Command {
  name = 'apply <data>';
  description = 'apply files/config to components';
  extendedDescription = inputDataDescription;
  alias = '';
  options = [
    ...snapFromScopeOptions,
    ['', 'snap', 'snap the components. default to keep them new'],
    ['', 'stream', 'relevant for --json only. stream loader as json strings'],
    ['x', 'skip-dependency-installation', 'do not auto-install dependencies of the imported components'],
  ] as CommandOptions;
  loader = true;
  private = true;

  constructor(
    private apply: ApplyMain,
    private logger: Logger
  ) {}

  async report(
    [data]: [string],
    {
      push = false,
      message = '',
      lane,
      ignoreIssues,
      build = false,
      skipTests = false,
      disableSnapPipeline = false,
      ignoreBuildErrors = false,
      rebuildDepsGraph,
      tag,
      snap,
      skipDependencyInstallation,
    }: Options
  ) {
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (disableTagAndSnapPipelines && ignoreBuildErrors) {
      throw new BitError('you can use either ignore-build-errors or disable-snap-pipeline, but not both');
    }

    const snapDataPerCompRaw = this.parseData(data);
    const hasForkedFrom = snapDataPerCompRaw.some((s) => s.forkFrom);
    const params = {
      push,
      message,
      lane,
      ignoreIssues,
      build,
      skipTests,
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      rebuildDepsGraph,
      tag,
      snap,
      skipDependencyInstallation,
    };

    const results = hasForkedFrom
      ? await this.apply.applyWithFork(snapDataPerCompRaw, params)
      : await this.apply.apply(snapDataPerCompRaw, params);

    const { snappedIds, exportedIds, newIds, updatedIds } = results;

    const snappedOutput = snappedIds.length ? `${chalk.bold('snapped components')}\n${snappedIds.join('\n')}` : '';
    const exportedOutput =
      exportedIds && exportedIds.length ? `${chalk.bold('exported components')}\n${exportedIds.join('\n')}` : '';
    const newOutput = newIds && newIds.length ? `${chalk.bold('new components')}\n${newIds.join('\n')}` : '';
    const updatedOutput =
      updatedIds && updatedIds.length ? `${chalk.bold('updated components')}\n${updatedIds.join('\n')}` : '';

    return compact([snappedOutput, exportedOutput, newOutput, updatedOutput]).join('\n\n');
  }

  async json(
    [data]: [string],
    {
      push = false,
      message = '',
      lane,
      ignoreIssues,
      build = false,
      skipTests = false,
      disableSnapPipeline = false,
      ignoreBuildErrors = false,
      rebuildDepsGraph,
      updateDependents,
      tag,
      snap,
    }: Options
  ) {
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (disableTagAndSnapPipelines && ignoreBuildErrors) {
      throw new BitError('you can use either ignore-build-errors or disable-snap-pipeline, but not both');
    }
    if (updateDependents && !lane) {
      throw new BitError('update-dependents flag is only available when snapping from a lane');
    }

    const snapDataPerCompRaw = this.parseData(data);
    const hasForkedFrom = snapDataPerCompRaw.some((s) => s.forkFrom);
    const params = {
      push,
      message,
      lane,
      ignoreIssues,
      build,
      skipTests,
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      rebuildDepsGraph,
      tag,
      snap,
    };

    try {
      const results = hasForkedFrom
        ? await this.apply.applyWithFork(snapDataPerCompRaw, params)
        : await this.apply.apply(snapDataPerCompRaw, params);

      return {
        code: 0,
        data: {
          exportedIds: results.exportedIds?.map((id) => id.toString()),
          snappedIds: results.snappedIds.map((id) => id.toString()),
          newIds: results.newIds?.map((id) => id.toString()),
          updatedIds: results.updatedIds?.map((id) => id.toString()),
        },
      };
    } catch (err: any) {
      this.logger.error('snap-from-scope.json, error: ', err);
      return {
        code: 1,
        error: err.message,
        stack: err.stack,
      };
    }
  }

  private parseData(data: string): SnapDataPerCompRaw[] {
    let dataParsed: unknown;
    try {
      dataParsed = JSON.parse(data);
    } catch (err: any) {
      throw new Error(`failed parsing the data entered as JSON. err ${err.message}`);
    }
    if (!Array.isArray(dataParsed)) {
      throw new Error('expect data to be an array');
    }
    dataParsed.forEach((dataItem) => {
      if (!dataItem.componentId) throw new Error('expect data item to have "componentId" prop');
      dataItem.files?.forEach((file) => {
        if (!file.path) throw new Error('expect file to have "path" prop');
        if (file.content) {
          file.content = Buffer.from(file.content, 'base64').toString();
        }
      });
    });

    return dataParsed;
  }
}
