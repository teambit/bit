import { readFileSync, createWriteStream } from 'fs';
import watch from '@jest/core/build/watch';
import { createDirectory, preRunMessage } from 'jest-util';
import { CustomConsole } from '@jest/console';
import { readConfigs } from 'jest-config';
import Runtime, { Context } from 'jest-runtime';
import createContext from '@jest/core/build/lib/createContext';

export async function buildContextsAndHasteMaps(
  globalConfig: any,
  configs: Array<any>,
  outputStream: NodeJS.WriteStream
) {
  const hasteMapInstances = Array(configs.length);
  const contexts = await Promise.all(
    configs.map(async (config, index) => {
      createDirectory('/tmp/jest-cache');
      const hasteMapInstance = Runtime.createHasteMap(config, {
        console: new CustomConsole(outputStream, outputStream),
        maxWorkers: Math.max(1, Math.floor(globalConfig.maxWorkers / configs.length)),
        resetCache: !config.cache,
        watch: globalConfig.watch || globalConfig.watchAll,
        watchman: globalConfig.watchman,
      });
      hasteMapInstances[index] = hasteMapInstance;
      return createContext(config, await hasteMapInstance.build());
    })
  );

  return { contexts, hasteMapInstances };
}

export async function runJestCli(argv: any, projects: Array<any>) {
  const stream = createWriteStream('/tmp/jest/empty.txt');

  const { globalConfig, configs, hasDeprecationWarnings } = await readConfigs(argv, projects);

  //@ts-ignore
  const { contexts, hasteMapInstances } = await this.buildContextsAndHasteMaps(globalConfig, configs, stream);
  watch(
    globalConfig,
    contexts,
    //@ts-ignore
    stream,
    hasteMapInstances,
    undefined,
    undefined,
    undefined
  );
}
