/** @flow */
import Command from '../../command';
import ComponentObjects from '../../../scope/component-objects';
import { fromBase64, buildCommandMessage, packCommand } from '../../../utils';
import { put } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';

export default class Put extends Command {
  name = '_put <path> <args>';
  private = true;
  description = 'upload a component to a scope';
  alias = '';
  opts = [];

  action([path]: [string, string]): Promise<any> {
    let data = '';
    return new Promise((resolve, reject) => {
      process.stdin
        .on('data', (chunk) => {
          data += chunk.toString();
        })
        .on('end', () => {
          logger.info('Checking if a migration is needed');
          const scopePath = fromBase64(path);
          return migrate(scopePath, false)
            .then(() => {
              return put({ componentObjects: fromBase64(data.toString()), path: scopePath });
            })
            .then(resolve)
            .catch(reject);
        });
    });
  }

  report(componentsObjects: ComponentObjects[]): string {
    return packCommand(buildCommandMessage({ message: `${componentsObjects.length} components have been exported` }));
  }
}
