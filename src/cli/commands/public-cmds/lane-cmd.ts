import chalk from 'chalk';
import Command from '../../command';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { lane } from '../../../api/consumer';
import { LaneResults } from '../../../api/consumer/lib/lane';

export default class Lane extends Command {
  name = 'lane [name]';
  description = `manage lanes
  bit lane => shows all available lanes and mark the checked out lane
  bit lane name => creates a new lane
  https://${BASE_DOCS_DOMAIN}/docs/lanes`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['c', 'components', 'show more details on the state of each component in each lane'],
    ['r', 'remove', 'delete a merged lane'],
    ['', 'merged', 'show merged lanes'],
    ['', 'not-merged', 'show not merged lanes']
  ];
  loader = true;
  migration = true;

  action(
    [name]: string[],
    {
      components = false,
      remove = false,
      merged = false,
      notMerged = false
    }: {
      components: boolean;
      remove: boolean;
      merged: boolean;
      notMerged: boolean;
    }
  ): Promise<any> {
    return lane({
      name,
      components,
      remove,
      merged,
      notMerged
    });
  }

  report(results: LaneResults): string {
    if (results.added) {
      return chalk.green(`successfully added a new lane ${chalk.bold(results.added)}`);
    }
    if (results.lanes) {
      return results.lanes
        .map(laneName => {
          return laneName === results.currentLane ? `* ${laneName}` : laneName;
        })
        .join('\n');
    }
    if (results.lanesWithComponents) {
      return Object.keys(results.lanesWithComponents)
        .map(laneName => {
          const laneStr = laneName === results.currentLane ? `* ${laneName}` : laneName;
          // @ts-ignore
          const components = results.lanesWithComponents[laneName]
            .map(c => `${c.id.toString()}\t${c.head}`)
            .join('\t\n');
          return `${chalk.bold(laneStr)}\n\t${components}`;
        })
        .join('\n');
    }
    return JSON.stringify(results, null, 2);
  }
}
