// todo: fix according to the build changes. buildInlineAll no longer exists

import chokidar from 'chokidar';
import { loadConsumer } from '../../../consumer';
import { buildInlineAll } from '../index';

export default function watch() {
  return loadConsumer()
  .then((consumer) => {
    return new Promise(() => {
      const projectInlineComponents = consumer.getInlineBitsPath();

      const watcher = chokidar.watch([projectInlineComponents], {
        ignoreInitial: true,
        ignored: '**/dist/**',
      });

      const log = console.log.bind(console); // eslint-disable-line
      console.log(`Starting watch "${consumer.getPath()}" for changes`); // eslint-disable-line

      watcher
        .on('add', (p) => {
          log(`File ${p} has been added, callind build`);
          buildInlineAll().catch((err) => {
            console.error(err); // eslint-disable-line
          });
        })
        .on('change', (p) => {
          log(`File ${p} has been changed, calling build`);
          buildInlineAll().catch((err) => {
            console.error(err); // eslint-disable-line
          });
        });
    });
  });
}
