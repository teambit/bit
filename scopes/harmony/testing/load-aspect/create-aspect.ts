import { resolve, join } from 'path';
import { getConsumerInfo } from '@teambit/legacy/dist/consumer';
import { propogateUntil as propagateUntil } from '@teambit/legacy/dist/utils';
import { readdirSync } from 'fs';
import { ConfigOptions } from '@teambit/harmony/dist/harmony-config/harmony-config';
import { Harmony, Aspect } from '@teambit/harmony';
import { ComponentID } from '@teambit/component';
import { Config } from '@teambit/harmony/dist/harmony-config';
import { CLIAspect } from '@teambit/cli';

function getPackageName(aspect: any, id: ComponentID) {
  return `@teambit/${id.name}`;
  // const [owner, name] = aspect.id.split('.');
  // return `@${owner}/${replaceAll(name, '/', '.')}`;
}

export async function loadAspect<T>(targetAspect: Aspect, cwd = process.cwd(), runtime = 'main'): Promise<T> {
  const config = await getConfig(cwd);
  const configMap = config.toObject();
  configMap['teambit.harmony/bit'] = {
    cwd,
  };

  const harmony = await Harmony.load([CLIAspect, targetAspect], runtime, configMap);

  await harmony.run(async (aspect, runtime) => {
    const id = ComponentID.fromString(aspect.id);
    const packageName = getPackageName(aspect, id);
    const mainFilePath = require.resolve(packageName);
    const packagePath = resolve(join(mainFilePath, '..'));
    const files = readdirSync(packagePath);
    const runtimePath = files.find((path) => path.includes(`.${runtime.name}.runtime.js`));
    if (!runtimePath) throw new Error(`could not find runtime '${runtime.name}' for aspect ID '${aspect.id}'`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const runtimeC = require(join(packagePath, runtimePath));
    if (aspect.id === targetAspect.id) {
      targetAspect.addRuntime(runtimeC.default);
    }
  });

  return harmony.get(targetAspect.id);
}

export async function getConfig(cwd = process.cwd()) {
  const consumerInfo = await getConsumerInfo(cwd);
  const scopePath = propagateUntil(cwd);
  const globalConfigOpts = {
    name: '.bitrc.jsonc',
  };
  const configOpts: ConfigOptions = {
    global: globalConfigOpts,
    shouldThrow: false,
    cwd: consumerInfo?.path || scopePath,
  };

  if (consumerInfo) {
    const config = Config.load('workspace.jsonc', configOpts);
    return config;
  }

  if (scopePath && !consumerInfo) {
    return Config.load('scope.jsonc', configOpts);
  }

  return Config.loadGlobal(globalConfigOpts);
}
