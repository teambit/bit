import chokidar from 'chokidar';
import path from 'path';
import { BIT_JSON_NAME, INLINE_COMPONENTS_DIRNAME } from '../constants';
import { bindAction } from '../actions';

export default function watch(projectRoot) {
  return new Promise(() => {
    const projectBitJson = path.join(projectRoot, BIT_JSON_NAME);
    const projectInlineComponents = path.join(projectRoot, INLINE_COMPONENTS_DIRNAME);

    const watcher = chokidar.watch([projectBitJson, projectInlineComponents], {
      ignoreInitial: true,
    });

    const log = console.log.bind(console); // eslint-disable-line
    console.log(`Starting watch "${projectRoot}" for changes`); // eslint-disable-line

    watcher
      .on('add', (p) => {
        log(`File ${p} has been added, callind the bind process`);
        bindAction();
      })
      .on('change', (p) => {
        log(`File ${p} has been changed, calling the bind process`);
        bindAction();
      })
      .on('unlink', (p) => {
        log(`File ${p} has been removed, calling the bind process`);
        bindAction();
      });
  });
}
