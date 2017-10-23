/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { latestVersions } from '../../../api/scope';

export default class Latest extends Command {
  name = '_latest <path> <args>';
  private = true;
  description = 'latest version numbers of given components';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    return latestVersions(fromBase64(path), payload);
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
