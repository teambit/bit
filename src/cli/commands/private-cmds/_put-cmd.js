/** @flow */
import Command from '../../command';
import ComponentObjects from '../../../scope/component-objects';
import { fromBase64, toBase64 } from '../../../utils';
import { put } from '../../../api/scope';

export default class Put extends Command {
  name = '_put <path> [objects]';
  private = true;
  description = 'upload a component to a scope';
  alias = '';
  opts = [];
  
  action([path, objects, ]: [ string, string, string, ]): Promise<any> {
    if (objects) return put({
      componentObjects: fromBase64(objects),
      path: fromBase64(path)
    });
    
    return new Promise((resolve,reject) => {
      process.stdin.on('readable', () => put({
          componentObjects: fromBase64(process.stdin.read().toString()),
          path: fromBase64(path)
        }).then(resolve).catch(reject)
      );
    })
  }

  report(componentObjects: ComponentObjects): string {
    return toBase64(componentObjects.toString());
  }
}
