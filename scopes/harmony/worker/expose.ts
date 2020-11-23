import { parentPort } from 'worker_threads';
import { expose as comlinkExpose } from 'comlink';
import nodeEndpoint from './node-endpoint';

export function expose(object: any) {
  return comlinkExpose(object, nodeEndpoint(parentPort));
}
