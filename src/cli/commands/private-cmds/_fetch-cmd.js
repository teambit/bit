/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { fetch } from '../../../api/scope';
import ComponentObjects from '../../../scope/component-objects';

export default class Fetch extends Command {
  name = '_fetch <path> <args>';
  private = true;
  description = 'fetch components(s) from a scope';
  alias = '';
  opts = [['n', 'no_dependencies', 'do not include component dependencies']];

  action([path, args]: [string, string], { no_dependencies }: any): Promise<any> {
    const { payload } = unpackCommand(args);
    return fetch(fromBase64(path), payload, no_dependencies);
  }

  report(componentObjects: ComponentObjects[]): string {
    const components = componentObjects.map(obj => obj.toString());
    return packCommand(buildCommandMessage(components));
  }
}
