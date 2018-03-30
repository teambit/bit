/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { merge } from '../../../api/consumer';
import type {
  UseProps,
  MergeStrategy,
  SwitchVersionResults,
  ApplyVersionResult
} from '../../../consumer/component/switch-version';
import { MergeOptions } from '../../../consumer/component/switch-version';
import { BitId } from '../../../bit-id';

export default class Merge extends Command {
  name = 'merge <version> <ids...>';
  description = 'merge versions';
  alias = '';
  opts = [
    ['o', 'ours', 'in case of a conflict, use ours (current version)'],
    ['t', 'theirs', 'in case of a conflict, use theirs (specified version)'],
    ['m', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['', 'skip-npm-install', 'do not install packages of the imported components'],
    ['', 'ignore-dist', 'do not write dist files (when exist)']
  ];
  loader = true;

  action(
    [version, ids]: [string, string[]],
    {
      ours = false,
      theirs = false,
      manual = false,
      verbose = false,
      skipNpmInstall = false,
      ignoreDist = false
    }: {
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
    const mergeStrategy = getMergeStrategy();
    const useProps: UseProps = {
      version,
      ids: bitIds,
      promptMergeOptions: !mergeStrategy, // is user didn't specify merge strategy, prompt with options
      mergeStrategy,
      verbose,
      skipNpmInstall,
      ignoreDist
    };
    return merge(useProps);
  }

  report({ components, version }: SwitchVersionResults): string {
    const title = `the following components were merged from version ${chalk.bold(version)}\n`;
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
