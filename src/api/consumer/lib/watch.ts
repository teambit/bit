import WatchComponents from '../../../consumer/component-ops/watch-components';

/**
 * Watch all components specified in bit.map.
 * Run buildAll for each change in the watched paths
 *
 * @export
 * @param {boolean} verbose - showing verbose output for inspection
 * @returns
 */
export default (async function watchAll(verbose: boolean) {
  const watchComponent = new WatchComponents(verbose);
  return watchComponent.watchAll();
});
