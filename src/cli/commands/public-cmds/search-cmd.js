/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { searchAdapter } from '../../../search';

export default class Search extends Command {
  name = 'search [query...]';
  description = 'search for bits';
  alias = '';
  opts = [
    ['s', 'scope <scopename>', 'search in scope'],
    ['r', 'reindex', 're-index all components']
  ];
  
  action([query, ]: [string[], ], { scope, reindex }) {
    const queryStr = query.join(' ');
    console.log(`searching bits in ${scope ? scope : 'local scope'} for "${queryStr}"`);
    if (scope) {
      return searchAdapter.searchRemotely(queryStr, scope, reindex);
    }
    return searchAdapter.searchLocally(queryStr, reindex);
  }

  report(searchResults: string): string {
    const parsedResults = JSON.parse(searchResults);
    if (!parsedResults.length) {
      return chalk.red('No Results');
    }
    return chalk.green(parsedResults.join('\n'));
  }
}
