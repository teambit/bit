/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { searchAdapter } from '../../../search';
import { formatter } from '../../../search/searcher';
import { Doc } from '../../../search/indexer';

export default class Search extends Command {
  name = 'search [query...]';
  description = 'search for components';
  alias = '';
  opts = [
    ['s', 'scope <scopename>', 'search in scope'],
    ['r', 'reindex', 're-index all components']
  ];
  loader = { autoStart: false };

  action([query, ]: [string[], ], { scope, reindex }: { scope: string, reindex: boolean }) {
    const queryStr = query.join(' ');
    if (scope) {
      // $FlowFixMe
      this.loader.text = `searching remote scope <${scope}> for '${queryStr}'`;
      // $FlowFixMe
      this.loader.start();
      return searchAdapter.searchRemotely(queryStr, scope, reindex);
    }
    
    console.log(`searching components in ${scope ? scope : 'local scope'} for "${queryStr}"`);
    return searchAdapter.searchLocally(queryStr, reindex);
  }

  report(searchResults: Array<Doc>): string {
    if (!searchResults.length) {
      return chalk.red('No Results');
    }
    return chalk.green(searchResults.map(formatter).join('\n'));
  }
}
