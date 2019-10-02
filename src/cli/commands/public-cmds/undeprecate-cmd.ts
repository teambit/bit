/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import { undeprecate } from '../../../api/consumer';
import Command from '../../command';
import type { DeprecationResult } from '../../../scope/component-ops/components-deprecation';

export default class Undeprecate extends Command {
  name = 'undeprecate <ids...>';
  description = 'undeprecate a deprecated component (local/remote)';
  alias = '';
  opts = [['r', 'remote [boolean]', 'undeprecate a component from a remote scope']];
  loader = true;
  migration = true;

  action([ids]: [string], { remote = false }: { remote: boolean }): Promise<any> {
    return undeprecate({ ids, remote });
  }

  report(deprecationResult: DeprecationResult | DeprecationResult[]): string {
    const paintMissingComponents = missingComponents =>
      (!R.isEmpty(missingComponents)
        ? chalk.underline('missing components:') + chalk(` ${missingComponents.join(', ')}\n`)
        : '');
    const paintRemoved = bitIds =>
      (!R.isEmpty(bitIds) && !R.isNil(bitIds)
        ? chalk.underline('undeprecated components:') + chalk(` ${bitIds.join(', ')}\n`)
        : '');
    const paintSingle = obj => paintRemoved(obj.bitIds) + paintMissingComponents(obj.missingComponents);
    const paintMany = (deprecationResults: DeprecationResult[]) =>
      deprecationResults.map(obj => paintSingle(obj)).join('\n');

    return Array.isArray(deprecationResult) ? paintMany(deprecationResult) : paintSingle(deprecationResult);
  }
}
