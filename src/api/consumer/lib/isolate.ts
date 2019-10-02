/** @flow */
import { loadScope, Scope } from '../../../scope';
import { loadConsumer } from '../../../consumer';
import logger from '../../../logger/logger';
import BitId from '../../../bit-id/bit-id';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import Isolator from '../../../environment/isolator';

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
  override: ?boolean,
  useCapsule: ?boolean
};

export default (async function isolate(componentId: string, scopePath: string, opts: IsolateOptions): Promise<string> {
  if (opts.useCapsule) {
    return isolateUsingCapsule(componentId, opts);
  }
  logger.debugAndAddBreadCrumb('isolate', 'starting isolation process');
  if (opts.verbose) console.log('starting isolation process'); // eslint-disable-line no-console
  let scope: Scope;
  // If a scope path provided we will take the component from that scope
  if (scopePath) {
    scope = await loadScope(scopePath);
    const bitId = await scope.getParsedId(componentId);
    return isolateComponent(scope, bitId, opts);
  }
  // If a scope path was not provided we will get the consumer's scope
  const consumer = await loadConsumer();
  scope = consumer.scope;
  const bitId = consumer.getParsedId(componentId);
  return isolateComponent(scope, bitId, opts);
});

async function isolateUsingCapsule(componentId: string, opts: IsolateOptions) {
  const consumer = await loadConsumer();
  const bitId = consumer.getParsedId(componentId);
  const isolator: Isolator = await Isolator.getInstance('fs', consumer.scope, consumer, opts.directory);
  return isolator.isolate(bitId, opts);
}

/**
 * import a component end to end. Including importing the dependencies and installing the npm
 * packages.
 *
 * @param {BitId} bitId - the component id to isolate
 * @param {IsolateOptions} opts
 * @return {Promise.<string>} - the path to the isolated component
 */
async function isolateComponent(scope: Scope, bitId: BitId, opts: IsolateOptions): Promise<string> {
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  const component = await scopeComponentsImporter.loadComponent(bitId);
  return component.isolate(scope, opts);
}
