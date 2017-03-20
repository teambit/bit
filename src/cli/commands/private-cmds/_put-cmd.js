/** @flow */
import Command from '../../command';
import ComponentObjects from '../../../scope/component-objects';
import { fromBase64, toBase64 } from '../../../utils';
import { put } from '../../../api/scope';

export default class Put extends Command {
  name = '_put <path>';
  private = true;
  description = 'upload a component to a scope';
  alias = '';
  opts = [];
  
  action([path]: [ string ]): Promise<any> {
    return new Promise((resolve,reject) => {
      console.log('should hang here:');
      let objects;
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', data => {
        console.log('before toString', data);
        objects = data.toString();
        return resolve(put({
          componentObjects: fromBase64(objects),
          path: fromBase64(path)
        }));
      });
    })
  }

  report(componentObjects: ComponentObjects): string {
    return toBase64(componentObjects.toString());
  }
}
