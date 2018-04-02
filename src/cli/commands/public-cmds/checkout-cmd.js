/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { BitId } from '../../../bit-id';
import { checkout } from '../../../api/consumer';
import { applyVersionReport } from './merge-cmd';
import { getMergeStrategy } from '../../../consumer/versions-ops/merge-version';
import type { UseProps } from '../../../consumer/versions-ops/checkout-version';
import type { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';

export default class Checkout extends Command {
  name = 'checkout <version> <ids...>';
  description = 'switch between versions';
  alias = 'U';
  opts = [
    [
      'i',
      'interactive-merge',
      'when a component is modified and the merge process found conflicts, display options to resolve them'
    ],
    ['o', 'ours', 'in case of a conflict, use ours (override the used version with the current modification)'],
    [
      't',
      'theirs',
      'in case of a conflict, use theirs (override the current modification and use the specified version)'
    ],
    ['m', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['', 'skip-npm-install', 'do not install packages of the imported components'],
    ['', 'ignore-dist', 'do not write dist files (when exist)']
  ];
  loader = true;

  action(
    [version, ids]: [string, string[]],
    {
      interactiveMerge = false,
      ours = false,
      theirs = false,
      manual = false,
      verbose = false,
      skipNpmInstall = false,
      ignoreDist = false
    }: {
      interactiveMerge?: boolean,
      ours?: boolean,
      theirs?: boolean,
      manual?: boolean,
      verbose?: boolean,
      skipNpmInstall?: boolean,
      ignoreDist?: boolean
    }
  ): Promise<ApplyVersionResults> {
    const bitIds = ids.map(id => BitId.parse(id));
    const useProps: UseProps = {
      version,
      ids: bitIds,
      promptMergeOptions: interactiveMerge,
      mergeStrategy: getMergeStrategy(ours, theirs, manual),
      verbose,
      skipNpmInstall,
      ignoreDist
    };
    return checkout(useProps);
  }

  report({ components, version }: ApplyVersionResults): string {
    if (components.length === 1) {
      const componentName = components[0].id.toStringWithoutVersion();
      const title = `successfully switched ${chalk.bold(componentName)} to version ${chalk.bold(version)}\n`;
      return `${title} ${applyVersionReport(components, false)}`;
    }

    const title = `successfully switched the selected component(s) to version ${chalk.bold(version)}\n\n`;
    const componentsStr = applyVersionReport(components);
    return `${title} ${componentsStr}`;
  }
}
