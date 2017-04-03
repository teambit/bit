/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, buildCommandMessage, packCommand } from '../../../utils';
import { searchAdapter } from '../../../search';
import { Doc } from '../../../search/indexer';

export default class Search extends Command {
  name = '_search <path> <args>';
  private = true;
  description = 'search for components on a remote scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    return searchAdapter.scopeSearch(fromBase64(path), payload.query, payload.reindex === 'true');
  }

  report(searchResults: Array<Doc>): string {
    return packCommand(buildCommandMessage(searchResults));
  }
}
