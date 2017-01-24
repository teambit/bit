/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { searcher } from '../../../search';

export default class Search extends Command {
  name = 'search [query...]';
  description = 'search for bits in configured remote(s)';
  alias = '';
  opts = [
    ['s', 'scope <scopename>', 'search in scope'],
    ['r', 'reindex', 're-index all components']
  ];
  
  action([query, ], { scope, reindex }) {
    const queryStr = query.join(' ');
    console.log(`searching bits in ${scope ? scope : 'local scope'} for "${queryStr}"`);
    const results = searcher.search(queryStr, scope, reindex);
    return new Promise(resolve => resolve(results));
  }

  report(searchResults: string): string {
    const parsedResults = JSON.parse(searchResults);
    if (!parsedResults.length) {
      return chalk.red('No Results');
    }
    return chalk.green(parsedResults.join('\n'));
  }
}
