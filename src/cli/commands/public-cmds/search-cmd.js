/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { searchAdapter } from '../../../search';
import { formatter } from '../../../search/searcher';
import { Doc } from '../../../search/indexer';

export default class Search extends Command {
  name = 'search <scope> <query...>';
  description = 'search for components';
  alias = '';
  opts = [
    ['r', 'reindex', 're-index all components']
  ];
  loader = { autoStart: false };

  action([scope, query, ]: [string, string[], ], { reindex }: { reindex: boolean }) {
    const queryStr = query.join(' ');
    if (scope !== '@this') {
      // $FlowFixMe
      this.loader.text = `searching remote scope <${scope}> for '${queryStr}'`;
      // $FlowFixMe
      this.loader.start();
      return searchAdapter.searchRemotely(queryStr, scope, reindex);
    }

    return searchAdapter.searchLocally(queryStr, reindex);
  }

  report(searchResults: Array<Doc>): string {
    if (!searchResults.length) {
      return chalk.red('No Results');
    }
    return chalk.green(searchResults.map(formatter).join('\n'));
  }
}
