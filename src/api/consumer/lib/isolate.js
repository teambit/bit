/** @flow */
import { loadScope, Scope } from '../../../scope';
import { loadConsumer } from '../../../consumer';
import logger from '../../../logger/logger';

// TODO: merge this with other instances of the same options
export type IsolateOptions = {
  writeToPath: ?string,
  writeBitDependencies: ?boolean,
  npmLinks: ?boolean,
  installPackages: ?boolean,
  installPeerDependencies: ?boolean,
  dist: ?boolean,
  conf: ?boolean,
  noPackageJson: ?boolean,
  override: ?boolean
};

export default (async function isolate(componentId: string, scopePath: string, opts: IsolateOptions): Promise<string> {
  logger.debug('starting isolation process');
  if (opts.verbose) console.log('starting isolation process'); // eslint-disable-line no-console
  let scope: Scope;
  // If a scope path provided we will take the component from that scope
  if (scopePath) {
    scope = await loadScope(scopePath);
    const bitId = await scope.getBitId(componentId);
    return scope.isolateComponent(bitId, opts);
  }
  // If a scope path was not provided we will get the consumer's scope
  const consumer = await loadConsumer();
  scope = consumer.scope;
  const bitId = consumer.getBitId(componentId);
  return scope.isolateComponent(bitId, opts);
});
