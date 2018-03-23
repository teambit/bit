/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { use } from '../../../api/consumer';
import { BitId } from '../../../bit-id';
import type { MergeStrategy } from '../../../consumer/component/switch-version';
import { MergeOptions } from '../../../consumer/component/switch-version';

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
    ['M', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later']
  ];
  loader = true;

  action(
    [version, ids]: [string, string[]],
    {
      merge,
      ours,
      theirs,
      manual
    }: {
      merge: ?boolean,
      ours: ?boolean,
      theirs: ?boolean,
      manual: ?boolean
    }
  ): Promise<*> {
    let mergeStrategy: ?MergeStrategy;
    if ((ours && theirs) || (ours && manual) || (theirs && manual)) {
      throw new Error('please choose only one options from: ours, theirs or manual');
    }
    if (ours) mergeStrategy = MergeOptions.ours;
    if (theirs) mergeStrategy = MergeOptions.theirs;
    if (manual) mergeStrategy = MergeOptions.manual;
    return use(version, ids, merge, mergeStrategy);
  }

  report({ components, version }: { components: BitId[], version: string }): string {
    const title = `the following components were switched to version ${chalk.bold(version)}\n`;
    const componentsStr = components
      .map((component) => {
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
