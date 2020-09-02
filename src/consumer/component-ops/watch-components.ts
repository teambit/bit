/* eslint no-console: 0 */
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import chalk from 'chalk';
import chokidar from 'chokidar';
import R from 'ramda';

import { loadConsumer } from '..';
import { build } from '../../api/consumer';
import { BitId } from '../../bit-id';
import loader from '../../cli/loader';
import { BIT_VERSION } from '../../constants';
import { pathNormalizeToLinux } from '../../utils';
import Consumer from '../consumer';

export const STARTED_WATCHING_MSG = 'started watching for component changes to rebuild';
export const WATCHER_COMPLETED_MSG = 'watching for changes';

export default class WatchComponents {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  consumer: Consumer;
  verbose: boolean;
  trackDirs: { [dir: string]: string } = {}; // dir => component-id

  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  async watchAll() {
    // TODO: run build in the beginning of process (it's work like this in other envs)
    this.consumer = await loadConsumer();
    const watcher = this._getWatcher();
    console.log(chalk.yellow(`bit binary version: ${BIT_VERSION}`));
    console.log(chalk.yellow(`node version: ${process.version}`));
    const log = console.log.bind(console);

    return new Promise((resolve, reject) => {
      // prefix your command with "BIT_LOG=*" to see all watch events
      if (process.env.BIT_LOG) {
        watcher.on('all', (event, path) => {
          log(event, path);
        });
      }
      watcher.on('ready', () => {
        log(chalk.yellow(STARTED_WATCHING_MSG));
      });
      watcher.on('change', (p) => {
        log(`file ${p} has been changed`);
        this._handleChange(p).catch((err) => reject(err));
      });
      watcher.on('add', (p) => {
        log(`file ${p} has been added`);
        this._handleChange(p, true).catch((err) => reject(err));
      });
      watcher.on('unlink', (p) => {
        log(`file ${p} has been removed`);
        this._handleChange(p).catch((err) => reject(err));
      });
      watcher.on('error', (err) => {
        log(`Watcher error ${err}`);
        reject(err);
      });
    });
  }

  async _handleChange(filePath: string, isNew = false) {
    const componentId = await this._getBitIdByPathAndReloadConsumer(filePath, isNew);
    if (componentId) {
      const idStr = componentId.toString();
      console.log(`running build for ${chalk.bold(idStr)}`);
      // TODO: Make sure the log for build is printed to console
      const buildResults = await build(idStr, false, this.verbose);
      if (buildResults) {
        console.log(`\t${chalk.cyan(buildResults.join('\n\t'))}`);
      } else {
        console.log(`${idStr} doesn't have a compiler, nothing to build`);
      }
    } else {
      console.log(`file ${filePath} is not part of any component, ignoring it`);
    }

    loader.stop();
    console.log(chalk.yellow(WATCHER_COMPLETED_MSG));
  }

  async _getBitIdByPathAndReloadConsumer(filePath: string, isNew: boolean): Promise<BitId | null | undefined> {
    const relativeFile = pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(filePath));
    let componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
    if (!isNew && !componentId) {
      return null;
    }
    this.consumer = await loadConsumer(undefined, true);
    if (!componentId) {
      componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
    }
    if (isNew && !componentId) {
      const trackDir = Object.keys(this.trackDirs).find((dir) => relativeFile.startsWith(dir));
      if (trackDir) {
        const id = this.trackDirs[trackDir];
        const bitId = this.consumer.getParsedId(id);
        // loading the component causes the bitMap to be updated with the new path
        await this.consumer.loadComponent(bitId);
        componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
      }
    }
    return componentId;
  }

  _getWatcher() {
    const pathsToWatch = this._getPathsToWatch();
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
      useFsEvents: false,
    });
  }

  _getPathsToWatch(): string[] {
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    const paths = componentsFromBitMap.map((componentMap) => {
      const componentId = componentMap.id.toString();
      const trackDir = componentMap.getTrackDir();
      if (trackDir) {
        this.trackDirs[trackDir] = componentId;
      }
      const relativePaths = trackDir ? [trackDir] : componentMap.getFilesRelativeToConsumer();
      const absPaths = relativePaths.map((relativePath) => this.consumer.toAbsolutePath(relativePath));
      if (this.verbose) {
        console.log(`watching ${chalk.bold(componentId)}\n${absPaths.join('\n')}`);
      }
      return absPaths;
    });
    return R.flatten(paths);
  }
}
