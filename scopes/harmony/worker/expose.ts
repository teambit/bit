// eslint-disable-next-line import/no-unresolved
import { parentPort, MessageChannel } from 'worker_threads';
import { expose as comlinkExpose, proxyMarker, wrap, transferHandlers } from 'comlink';
import nodeEndpoint from './node-endpoint';

export function setFunctionHandlers() {
  // Override comlink's default proxy handler to use Node endpoints
  transferHandlers.set('proxy', {
    canHandle: (obj) => obj && obj[proxyMarker],
    serialize: (obj) => {
      const { port1, port2 } = new MessageChannel();
      comlinkExpose(obj, nodeEndpoint(port1));
      return [port2, [port2]];
    },
    deserialize: (port: any) => {
      port = nodeEndpoint(port);
      port.start();
      return wrap(port);
    },
  } as any);
}

setFunctionHandlers();

export function expose(object: any) {
  return comlinkExpose(object, nodeEndpoint(parentPort));
}
