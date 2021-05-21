import chalk from 'chalk';
import R from 'ramda';

import { deprecate } from '../../../api/consumer';
import { DeprecationResult } from '../../../scope/component-ops/components-deprecation';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Deprecate implements LegacyCommand {
  name = 'deprecate <ids...>';
  description = 'deprecate a component (local/remote)';
  group: Group = 'collaborate';
  skipWorkspace = true;
  alias = 'd';

  opts = [['r', 'remote [boolean]', 'deprecate a component from a remote scope']] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  action([ids]: [string], { remote = false }: { remote: boolean }): Promise<any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return deprecate({ ids, remote });
  }

  report(deprecationResult: DeprecationResult | DeprecationResult[]): string {
    const paintMissingComponents = (missingComponents) =>
      !R.isEmpty(missingComponents)
        ? chalk.underline('missing components:') + chalk(` ${missingComponents.join(', ')}\n`)
        : '';
    const paintRemoved = (bitIds) =>
      !R.isEmpty(bitIds) && !R.isNil(bitIds)
        ? chalk.underline('deprecated components:') + chalk(` ${bitIds.join(', ')}\n`)
        : '';
    const paintSingle = (obj) => paintRemoved(obj.bitIds) + paintMissingComponents(obj.missingComponents);
    const paintMany = (deprecationResults: DeprecationResult[]) =>
      deprecationResults.map((obj) => paintSingle(obj)).join('\n');

    return Array.isArray(deprecationResult) ? paintMany(deprecationResult) : paintSingle(deprecationResult);
  }
}
