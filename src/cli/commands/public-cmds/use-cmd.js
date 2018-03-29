/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { use } from '../../../api/consumer';
import type {
  UseProps,
  MergeStrategy,
  SwitchVersionResults,
  ApplyVersionResult
} from '../../../consumer/component/switch-version';
import { MergeOptions } from '../../../consumer/component/switch-version';
import { BitId } from '../../../bit-id';

export default class Use extends Command {
  name = 'use <version> <ids...>';
  description = 'switch between versions';
  alias = 'U';
  opts = [
    [
      'm',
      'merge',
      'when a component is modified and the merge process found conflicts, display options to resolve them'
    ],
    ['o', 'ours', 'in case of a conflict, use ours (override the used version with the current modification)'],
    [
      't',
      'theirs',
      'in case of a conflict, use theirs (override the current modification and use the specified version)'
    ],
    ['M', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['', 'skip-npm-install', 'do not install packages of the imported components'],
    ['', 'ignore-dist', 'write dist files (when exist) to the configured directory']
  ];
  loader = true;

  action(
    [version, ids]: [string, string[]],
    {
      merge = false,
      ours = false,
      theirs = false,
      manual = false,
      verbose = false,
      skipNpmInstall = false,
      ignoreDist = false
    }: {
      merge?: boolean,
      ours?: boolean,
      theirs?: boolean,
      manual?: boolean,
      verbose?: boolean,
      skipNpmInstall?: boolean,
      ignoreDist?: boolean
    }
  ): Promise<SwitchVersionResults> {
    const getMergeStrategy = (): ?MergeStrategy => {
      if ((ours && theirs) || (ours && manual) || (theirs && manual)) {
        throw new Error('please choose only one of the following: ours, theirs or manual');
      }
      if (ours) return MergeOptions.ours;
      if (theirs) return MergeOptions.theirs;
      if (manual) return MergeOptions.manual;
      return null;
    };

    const bitIds = ids.map(id => BitId.parse(id));
    const useProps: UseProps = {
      version,
      ids: bitIds,
      promptMergeOptions: merge,
      mergeStrategy: getMergeStrategy(),
      verbose,
      skipNpmInstall,
      ignoreDist
    };
    return use(useProps);
  }

  report({ components, version }: SwitchVersionResults): string {
    const title = `the following components were switched to version ${chalk.bold(version)}\n`;
    const componentsStr = components
      .map((component: ApplyVersionResult) => {
        const name = component.id.toStringWithoutVersion();
        const files = Object.keys(component.filesStatus)
          .map(file => `\t${chalk.bold(file)} => ${component.filesStatus[file]}`)
          .join('\n');
        return `${name}\n${chalk.cyan(files)}`;
      })
      .join('\n\n');
    return chalk.underline(title) + chalk.green(componentsStr);
  }
}
