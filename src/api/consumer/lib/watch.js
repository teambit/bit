// todo: fix according to the build changes. buildInlineAll no longer exists

import chokidar from 'chokidar';
import R from 'ramda';
import { loadConsumer } from '../../../consumer';
import { build, buildAll } from '../index';
import logger from '../../../logger/logger';
import ComponentsList from '../../../consumer/component/components-list';

/**
 * Watch all components specified in bit.lock.
 * Run buildAll for each change in the watched paths
 * 
 * @export
 * @param {boolean} verbose - showing verbose output for inspection 
 * @returns 
 */
export async function watchAll(verbose) {
  // TODO: run build in the begining of process (it's work like this in other envs)
  const consumer = await loadConsumer();
  const consumerPath = consumer.getPath();
  const componentsList = new ComponentsList(consumer);
  const bitlockComponents = await componentsList.getFromBitLock();
  const bitlockComponentsValues = R.values(bitlockComponents);
  const addConsumerPath = x => consumerPath + '/' + x.path;
  const bitlockComponentsPaths = R.map(addConsumerPath, bitlockComponentsValues);
  const watcher = chokidar.watch(bitlockComponentsPaths, {
        ignoreInitial: true,
        ignored: '**/dist/**',
      });

  const log = console.log.bind(console); // eslint-disable-line
  console.log(`Starting watch for changes`); // eslint-disable-line

  if (verbose){
    // Print all watched paths 
    bitlockComponentsPaths.forEach(path => console.log(`Watching ${path}`));
  }

  watcher
    .on('change', (p) => {
      const log = console.log.bind(console); 
      log(`File ${p} has been changed, calling build`);
      // TODO: Make sure the log for build is printed to console
      buildAll()
        .then((buildResult) => {
          console.log(buildResult);
        })
        .catch((err) => {
          log(err); // eslint-disable-line
        });
    });

  return new Promise(() => {});
}
