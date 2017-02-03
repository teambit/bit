/** @flow */
import Command from '../../command';
import { fromBase64 } from '../../../utils';
import { searchAdapter } from '../../../search';
import { Doc } from '../../../search/indexer';

export default class Search extends Command {
  name = '_search <path> <query> <reindex>';
  private = true;
  description = 'search for components on a remote scope';
  alias = '';
  opts = [];

  action([path, query, reindex]: [string, string, string]): Promise<any> {
    return searchAdapter.scopeSearch(fromBase64(path), fromBase64(query), fromBase64(reindex) === 'true');
  }

  report(searchResults: Array<Doc>): string {
    return JSON.stringify(searchResults);
  }
}
