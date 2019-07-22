/** @flow */
/* eslint no-console: 0 */

import chokidar from 'chokidar';
import R from 'ramda';
import chalk from 'chalk';
import { loadConsumer } from '../../../consumer';
import { build } from '../lib/build';
import loader from '../../../cli/loader';
import Consumer from '../../../consumer/consumer';

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
  const watcher = _getWatcher();

  console.log(chalk.yellow('started watching for component changes to rebuild'));
  const log = console.log.bind(console);

  return new Promise((resolve, reject) => {
    // prefix your command with "BIT_LOG=*" to see all watch events
    if (process.env.BIT_LOG) {
      watcher.on('all', (event, path) => {
        log(event, path);
      });
    }
    watcher.on('ready', () => {
      log(chalk.yellow('Initial scan complete. Ready for changes'));
    });
    watcher.on('change', (p) => {
      log(`File ${p} has been changed, calling build`);
      _handleChange(p).catch(err => reject(err));
    });
    watcher.on('add', (p) => {
      log(`File ${p} has been added`);
      _handleChange(p, true).catch(err => reject(err));
    });
    watcher.on('unlink', (p) => {
      log(`File ${p} has been removed`);
      _handleChange(p).catch(err => reject(err));
    });
    watcher.on('error', (err) => {
      log(`Watcher error ${err}`);
      reject(err);
    });
  });

  async function _handleChange(filePath: string, isNew: boolean = false) {
    const relativeFile = consumer.getPathRelativeToConsumer(filePath);
    let componentId = consumer.bitMap.getComponentIdByPath(relativeFile);
    if (!isNew && !componentId) {
      log(`file ${filePath} is not part of any component, ignoring it`);
      return;
    }
    const updatedConsumer = await loadConsumer(undefined, true);
    if (!componentId) {
      componentId = updatedConsumer.bitMap.getComponentIdByPath(relativeFile);
    }
    if (!componentId) {
      log(`file ${filePath} is not part of any component, ignoring it`);
      return;
    }
    const idStr = componentId.toString();
    console.log(`running build for ${chalk.bold(idStr)}`);
    // TODO: Make sure the log for build is printed to console
    const buildResults = await build(idStr, false, verbose);
    if (buildResults) {
      console.log(`\t${buildResults.join('\n\t')}`);
    } else {
      console.log(`${idStr} doesn't have a compiler, nothing to build`);
    }

    loader.stop();
    console.log(chalk.yellow('watching for changes'));
  }

  function _getWatcher() {
    const pathsToWatch = _getPathsToWatch();
    return chokidar.watch(pathsToWatch, {
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
  }

  function _getPathsToWatch(): string[] {
    const componentsFromBitMap = consumer.bitMap.getAllComponents();
    const paths = Object.keys(componentsFromBitMap).map((componentId) => {
      const componentMap = componentsFromBitMap[componentId];
      const trackDir = componentMap.getTrackDir();
      const relativePaths = trackDir ? [trackDir] : componentMap.getFilesRelativeToConsumer();
      const absPaths = relativePaths.map(relativePath => consumer.toAbsolutePath(relativePath));
      if (verbose) {
        console.log(`watching ${chalk.bold(componentId)}\n${absPaths.join('\n')}`);
      }
      return absPaths;
    });
    return R.flatten(paths);
  }
});
