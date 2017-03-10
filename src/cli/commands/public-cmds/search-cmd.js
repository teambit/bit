/** @flow */
import chalk from 'chalk';
import requestify from 'requestify';
import Command from '../../command';
import { searchAdapter } from '../../../search';
import { formatter } from '../../../search/searcher';
import { Doc } from '../../../search/indexer';
import loader from '../../../cli/loader';
import { LOCAL_SCOPE_NOTATION, SEARCH_DOMAIN } from '../../../constants';
import { BEFORE_REMOTE_SEARCH } from '../../../cli/loader/loader-messages';

export default class Search extends Command {
  name = 'search <query...>';
  description = 'search for components';
  alias = '';
  opts = [
    ['s', 'scope <scopename>', 'search in scope'],
    ['r', 'reindex', 're-index all components']
  ];
  loader = true;

  action([query, ]: [string[], ], { scope, reindex }: { scope: string, reindex: boolean }) {
    const queryStr = query.join(' ');
    if (!scope) { // web search
      const url = `https://${SEARCH_DOMAIN}/search/?q=${queryStr}`;
      return requestify.get(url).then((response) => {
        const body = response.getBody();
        return Promise.resolve(body.payload.hits);
      });
    }
    if (scope !== LOCAL_SCOPE_NOTATION) {
      loader.start(BEFORE_REMOTE_SEARCH({ scope, queryStr })); // eslint-disable-line
      return searchAdapter.searchRemotely(queryStr, scope, reindex);
    }

    return searchAdapter.searchLocally(queryStr, reindex);
  }

  report(searchResults: Array<Doc|*>): string {
    if (!searchResults.length) {
      return chalk.red('No Results');
    }
    return chalk.green(searchResults.map(formatter).join('\n'));
  }
}
