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
  // TODO: run build in the beginning of process (it's work like this in other envs)
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const bitMapComponentsPaths = componentsList.getPathsToWatchForAllComponents(undefined, true);
  // const watcher = chokidar.watch(bitMapComponentsPaths, {
  const watcher = chokidar.watch(bitMapComponentsPaths, {
    ignoreInitial: true,
    // Using the function way since the regular way not working as expected
    // It might be solved when upgrading to chokidar > 3.0.0
    // See:
    // https://github.com/paulmillr/chokidar/issues/773
    // https://github.com/paulmillr/chokidar/issues/492
    // https://github.com/paulmillr/chokidar/issues/724
    ignored: (path) => {
      // Ignore package.json temporarily since it cerates endless loop since it's re-written after each build
      if (path.includes('dist') || path.includes('node_modules') || path.includes('package.json')) {
        return true;
      }
      return false;
    },
    persistent: true,
    useFsEvents: false
  });

  console.log(chalk.yellow('Starting watch for changes')); // eslint-disable-line no-console

  if (verbose) {
    // Print all watched paths
    bitMapComponentsPaths.forEach(path => console.log(`Watching ${path}`)); // eslint-disable-line no-console
  }

  const log = console.log.bind(console); // eslint-disable-line no-console

  return new Promise((resolve, reject) => {
    // prefix your command with "BIT_LOG=*" to see all watch events
    if (process.env.BIT_LOG) {
      watcher.on('all', (event, path) => {
        log(event, path);
      });
    }
    watcher.on('ready', () => {
      log(chalk.yellow('Initial scan complete. Ready for changes'));
      // if (verbose) {
      //   const watchedPaths = watcher.getWatched();
      //   console.log('watchedPaths', watchedPaths)
      // }
    });
    watcher.on('change', (p) => {
      log(`File ${p} has been changed, calling build`);
      _handleChange().catch(err => reject(err));
    });
    watcher.on('add', (p) => {
      log(`File ${p} has been added`);
      _handleChange().catch(err => reject(err));
    });
    watcher.on('unlink', (p) => {
      log(`File ${p} has been removed`);
      _handleChange().catch(err => reject(err));
    });
    watcher.on('error', (err) => {
      log(`Watcher error ${err}`);
      reject(err);
    });
  });
});

async function _handleChange() {
  loadConsumer.cache = null;
  // TODO: Make sure the log for build is printed to console
  buildAll(false, false)
    .then((buildResult) => {
      console.log(buildResult); // eslint-disable-line no-console
      loader.stop();
      console.log(chalk.yellow('watching for changes')); // eslint-disable-line no-console
    })
    .catch((err) => {
      console.log(err); // eslint-disable-line
      throw err;
    });
}
