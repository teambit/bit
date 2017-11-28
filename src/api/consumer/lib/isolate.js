/** @flow */
import { loadScope } from '../../../scope';
import { loadConsumer } from '../../../consumer';
import logger from '../../../logger/logger';

// TODO: merge this with other instances of the same options
export type IsolateOptions = {
  directory: ?string,
  write_bit_dependencies: ?boolean,
  npm_links: ?boolean,
  install_packages: ?boolean,
  no_package_json: ?boolean,
  override: ?boolean
};

export default (async function isolate(componentId: string, scopePath: string, opts: IsolateOptions): Promise<string> {
  logger.debug('starting isolation process');
  if (opts.verbose) console.log('starting isolation process'); // eslint-disable-line no-console
  let scope;
  // If a scope path provided we will take the component from that scope
  if (scopePath) {
    scope = await loadScope(scopePath);
    return scope.isolateComponent(componentId, opts);
  }
  // If a scope path was not provided we will get the consumer's scope
  const consumer = await loadConsumer();
  scope = consumer.scope;
  return scope.isolateComponent(componentId, opts);
});
