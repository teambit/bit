/* eslint no-console: 0 */
import chokidar from 'chokidar';
import R from 'ramda';
import chalk from 'chalk';
import loader from 'bit-bin/cli/loader';
import { BitId } from 'bit-bin/bit-id';
import { BIT_VERSION, STARTED_WATCHING_MSG, WATCHER_COMPLETED_MSG } from 'bit-bin/constants';
import { pathNormalizeToLinux } from 'bit-bin/utils';

import { Compile } from '@bit/bit.core.compile';
import { Workspace } from '@bit/bit.core.workspace';
import { Consumer } from 'bit-bin/consumer';

export default class Watch {
  constructor(
    private compile: Compile,
    private workspace: Workspace,
    private trackDirs: { [dir: string]: string } = {},
    private verbose = false
  ) {}

  async watch(opts: { verbose?: boolean }) {
    this.verbose = Boolean(opts.verbose);
    await this.watchAll();
  }

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async watchAll() {
    // TODO: run build in the beginning of process (it's work like this in other envs)
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
      watcher.on('change', p => {
        log(`file ${p} has been changed`);
        this._handleChange(p).catch(err => reject(err));
      });
      watcher.on('add', p => {
        log(`file ${p} has been added`);
        this._handleChange(p, true).catch(err => reject(err));
      });
      watcher.on('unlink', p => {
        log(`file ${p} has been removed`);
        this._handleChange(p).catch(err => reject(err));
      });
      watcher.on('error', err => {
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
      const buildResults = await this.compile.compile([idStr], false, this.verbose);
      const buildPaths = buildResults[0].buildResults;
      if (buildPaths && buildPaths.length) {
        console.log(`\t${chalk.cyan(buildPaths.join('\n\t'))}`);
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
    // @todo: improve performance. probably only bit-map and the component itself need to be updated
    await this.workspace._reloadConsumer();

    if (!componentId) {
      componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
    }
    if (isNew && !componentId) {
      const trackDir = Object.keys(this.trackDirs).find(dir => relativeFile.startsWith(dir));
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
      ignored: path => {
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

  _getPathsToWatch(): string[] {
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    const paths = componentsFromBitMap.map(componentMap => {
      const componentId = componentMap.id.toString();
      const trackDir = componentMap.getTrackDir();
      if (trackDir) {
        this.trackDirs[trackDir] = componentId;
      }
      const relativePaths = trackDir ? [trackDir] : componentMap.getFilesRelativeToConsumer();
      const absPaths = relativePaths.map(relativePath => this.consumer.toAbsolutePath(relativePath));
      if (this.verbose) {
        console.log(`watching ${chalk.bold(componentId)}\n${absPaths.join('\n')}`);
      }
      return absPaths;
    });
    return R.flatten(paths);
  }
}
