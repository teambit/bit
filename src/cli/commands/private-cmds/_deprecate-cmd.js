/** @flow */
import Command from '../../command';
import { deprecate } from '../../../api/scope';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';

export default class Deprecate extends Command {
  name = '_deprecate <path> <args>';
  private = true;
  description = 'deprecate a component from a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    return deprecate({ path: fromBase64(path), bitIds: payload.bitIds });
  }

  report(str): string {
    return packCommand(buildCommandMessage(str));
  }
}
