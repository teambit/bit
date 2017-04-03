/** @flow */
import Command from '../../command';
import ComponentObjects from '../../../scope/component-objects';
import { fromBase64, toBase64, unpackCommand } from '../../../utils';
import { put } from '../../../api/scope';

export default class Put extends Command {
  name = '_put <path> <args>';
  private = true;
  description = 'upload a component to a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { headers } = unpackCommand(args);
    // validateVersion(headers)
    return new Promise((resolve, reject) => {
      process.stdin.on('readable', () => {
        const data = process.stdin.read();
        if (data) {
          return put({ componentObjects: fromBase64(data.toString()), path: fromBase64(path) })
            .then(resolve).catch(reject);
        }
      });
    });
  }


  report(componentObjects: ComponentObjects): string {
    return toBase64(componentObjects.toString());
  }
}
