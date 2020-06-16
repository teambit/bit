import R from 'ramda';
import chalk from 'chalk';
import { undeprecate } from '../../../api/consumer';
import { LegacyCommand, CommandOptions } from '../../legacy-command';
import { DeprecationResult } from '../../../scope/component-ops/components-deprecation';

export default class Undeprecate implements LegacyCommand {
  name = 'undeprecate <ids...>';
  description = 'undeprecate a deprecated component (local/remote)';
  alias = '';
  opts = [['r', 'remote [boolean]', 'undeprecate a component from a remote scope']] as CommandOptions;
  loader = true;
  migration = true;
  skipWorkspace = true;
  remoteOp = true;

  action([ids]: [string], { remote = false }: { remote: boolean }): Promise<any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return undeprecate({ ids, remote });
  }

  report(deprecationResult: DeprecationResult | DeprecationResult[]): string {
    const paintMissingComponents = missingComponents =>
      !R.isEmpty(missingComponents)
        ? chalk.underline('missing components:') + chalk(` ${missingComponents.join(', ')}\n`)
        : '';
    const paintRemoved = bitIds =>
      !R.isEmpty(bitIds) && !R.isNil(bitIds)
        ? chalk.underline('undeprecated components:') + chalk(` ${bitIds.join(', ')}\n`)
        : '';
    const paintSingle = obj => paintRemoved(obj.bitIds) + paintMissingComponents(obj.missingComponents);
    const paintMany = (deprecationResults: DeprecationResult[]) =>
      deprecationResults.map(obj => paintSingle(obj)).join('\n');

    return Array.isArray(deprecationResult) ? paintMany(deprecationResult) : paintSingle(deprecationResult);
  }
}
