/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand } from '../../../utils';
import { searchAdapter } from '../../../search';
import { Doc } from '../../../search/indexer';

export default class Search extends Command {
  name = '_search <path> <args> ';
  private = true;
  description = 'search for components on a remote scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    // validateVersion(headers)
    return searchAdapter.scopeSearch(fromBase64(path), payload, fromBase64(reindex) === 'true');
  }

  report(searchResults: Array<Doc>): string {
    return JSON.stringify(searchResults);
  }
}
