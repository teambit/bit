/** @flow */

import chokidar from 'chokidar';
import chalk from 'chalk';
import { loadConsumer } from '../../../consumer';
import { buildAll } from '../lib/build';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';

/**
 * Watch all components specified in bit.map.
 * Run buildAll for each change in the watched paths
 *
 * @export
 * @param {boolean} verbose - showing verbose output for inspection
 * @returns
 */
export default (async function watchAll(verbose: boolean) {
  // TODO: run build in the begining of process (it's work like this in other envs)
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const bitMapComponentsPaths = componentsList.getPathsForAllFilesOfAllComponents(undefined, true);
  const watcher = chokidar.watch(bitMapComponentsPaths, {
    ignoreInitial: true,
    ignored: '**/dist/**'
  });

  console.log(chalk.yellow('Starting watch for changes')); // eslint-disable-line no-console

  if (verbose) {
    // Print all watched paths
    bitMapComponentsPaths.forEach(path => console.log(`Watching ${path}`)); // eslint-disable-line no-console
  }

  watcher.on('change', (p) => {
    const log = console.log.bind(console); // eslint-disable-line no-console
    log(`File ${p} has been changed, calling build`);
    // TODO: Make sure the log for build is printed to console
    buildAll(false, false)
      .then((buildResult) => {
        console.log(buildResult); // eslint-disable-line no-console
        loader.stop();
        console.log(chalk.yellow('watching for changes')); // eslint-disable-line no-console
      })
      .catch((err) => {
        log(err); // eslint-disable-line
      });
  });

  return new Promise(() => {});
});
