import { resolve, join } from 'path';
import { getConsumerInfo, loadConsumer } from '@teambit/legacy/dist/consumer';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import { readdirSync } from 'fs';
import { Harmony, Aspect } from '@teambit/harmony';
// TODO: expose this types from harmony (once we have a way to expose it only for node)
import { Config, ConfigOptions } from '@teambit/harmony/dist/harmony-config';
import { ComponentID } from '@teambit/component';
import { CLIAspect } from '@teambit/cli';
import { NodeAspect } from '@teambit/node';
import ComponentLoader from '@teambit/legacy/dist/consumer/component/component-loader';
import ComponentConfig from '@teambit/legacy/dist/consumer/config/component-config';
import ComponentOverrides from '@teambit/legacy/dist/consumer/config/component-overrides';
import { PackageJsonTransformer } from '@teambit/workspace.modules.node-modules-linker';
import WorkspaceConfig from '@teambit/legacy/dist/consumer/config/workspace-config';
import { DependenciesAspect } from '@teambit/dependencies';

function getPackageName(aspect: any, id: ComponentID) {
  return `@teambit/${id.name}`;
  // const [owner, name] = aspect.id.split('.');
  // return `@${owner}/${replaceAll(name, '/', '.')}`;
}

/**
 * ! important ! prefer using `loadManyAspects` instead of this function. otherwise, you may end up with
 * different instances of "Workspace" aspect for example for each one of the aspects you load.
 *
 * to make this work, export the main also as default (e.g. `export default LanesMain;`).
 * otherwise, it'll show an error "TypeError: Cannot read property 'runtime' of undefined".
 */
export async function loadAspect<T>(targetAspect: Aspect, cwd = process.cwd(), runtime = 'main'): Promise<T> {
  const harmony = await loadManyAspects([targetAspect], cwd, runtime);
  return harmony.get(targetAspect.id);
}

/**
 * returns an instance of Harmony. with this instance, you can get any aspect you loaded (or its dependencies).
 * e.g. `const workspace = harmony.get<Workspace>(WorkspaceAspect.id);`
 * when used for tests, specify all aspects you need and call it once. this way, you make sure all of them are in sync
 * and use the same instances of each other.
 */
export async function loadManyAspects(
  targetAspects: Aspect[],
  cwd = process.cwd(),
  runtime = 'main'
): Promise<Harmony> {
  clearGlobalsIfNeeded();
  const config = await getConfig(cwd);
  const configMap = config.toObject();
  configMap['teambit.harmony/bit'] = {
    cwd,
  };

  // CLIAspect is needed for register the main runtime. NodeAspect is needed to get the default env if nothing
  // was configured. If it's not loaded here, it'll throw an error later that there is no node-env.
  // DependenciesAspect is needed to make ComponentLoader.loadDeps hook works.
  const harmony = await Harmony.load([CLIAspect, DependenciesAspect, NodeAspect, ...targetAspects], runtime, configMap);

  await harmony.run(async (aspect, runtimeDef) => {
    const id = ComponentID.fromString(aspect.id);
    const mainFilePath = getMainFilePath(aspect, id);
    const packagePath = resolve(join(mainFilePath, '..'));
    const files = readdirSync(packagePath);
    const runtimePath = files.find((path) => path.includes(`.${runtimeDef.name}.runtime.js`));
    if (!runtimePath) throw new Error(`could not find runtime '${runtimeDef.name}' for aspect ID '${aspect.id}'`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const runtimeC = require(join(packagePath, runtimePath));
    if (aspect.manifest._runtimes.length === 0 || targetAspects.includes(aspect.id)) {
      // core-aspects running outside of bit-bin repo end up here. they don't have runtime.
      // this makes sure to load them from the path were they're imported
      if (!runtimeC.default) {
        throw new Error(`error: ${aspect.id} does not export its main-runtime as default.
go to the aspect-main file and add a new line with "export default YourAspectMain"`);
      }
      aspect.manifest.addRuntime(runtimeC.default);
    }
  });

  return harmony;
}

function getMainFilePath(aspect: any, id: ComponentID) {
  let packageName = getPackageName(aspect, id);
  try {
    // try core aspects
    return require.resolve(packageName);
  } catch (err) {
    // fallback to a naive way of converting componentId to pkg-name. (it won't work when the component has special pkg name settings)
    packageName = `@${id.scope.replace('.', '/')}.${id.fullName.replaceAll('/', '.')}`;
    return require.resolve(packageName);
  }
}

export async function getConfig(cwd = process.cwd()) {
  const consumerInfo = await getConsumerInfo(cwd);
  const scopePath = findScopePath(cwd);
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

function clearGlobalsIfNeeded() {
  if (!loadConsumer.cache && !PackageJsonTransformer.packageJsonTransformersRegistry.length) {
    return;
  }
  delete loadConsumer.cache;
  ComponentLoader.onComponentLoadSubscribers = [];
  ComponentOverrides.componentOverridesLoadingRegistry = {};
  ComponentConfig.componentConfigLoadingRegistry = {};
  PackageJsonTransformer.packageJsonTransformersRegistry = [];
  // @ts-ignore
  ComponentLoader.loadDeps = undefined;
  // don't clear this one. it's a static list of core-ids. if you delete it, you'll have to call
  // registerCoreExtensions() from @teambit/bit, which as far as I remember should not be a dependency of this aspect.
  // ExtensionDataList.coreExtensionsNames = new Map();
  // @ts-ignore
  WorkspaceConfig.workspaceConfigLoadingRegistry = undefined;
}
