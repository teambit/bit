import chalk from 'chalk';
import requestify from 'requestify';
import { LegacyCommand, CommandOptions } from '../../legacy-command';
import { searchAdapter } from '../../../search';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import { formatter } from '../../../search/searcher';
import { Doc } from '../../../search/indexer';
import loader from '../../../cli/loader';
import { SEARCH_DOMAIN } from '../../../constants';
import { BEFORE_REMOTE_SEARCH } from '../../../cli/loader/loader-messages';

export default class Search implements LegacyCommand {
  name = 'search <query...>';
  description = 'search for components by desired functionality.';
  alias = '';
  opts = [
    ['s', 'scope <scopename>', 'search in scope'],
    ['r', 'reindex', 're-index all components']
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  action([query]: [string[]], { scope, reindex }: { scope: string; reindex: boolean }): Promise<any> {
    const queryStr = query.join(' ');
    if (scope) {
      loader.start(BEFORE_REMOTE_SEARCH({ scope, queryStr }));
      return searchAdapter.searchRemotely(queryStr, scope, reindex).catch(() => {
        // web search
        const url = `https://${SEARCH_DOMAIN}/search/?q=${queryStr}`;
        return requestify.get(url).then(response => {
          const body = response.getBody();
          return Promise.resolve(body.payload.hits);
        });
      });
    }

    return Promise.reject(chalk.red('Local search is disabled for now'));
    // return searchAdapter.searchLocally(queryStr, reindex);
  }

  report(searchResults: Array<Doc | any>): string {
    if (!searchResults.length) {
      return chalk.yellow('no results found');
    }
    return chalk.green(searchResults.map(formatter).join('\n'));
  }
}
