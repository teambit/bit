import fs from 'fs-extra';
import path from 'path';
import { ComponentDependency, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ComponentMap } from '@teambit/component';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';

export async function createRootComponentsDir(
  depResolver: DependencyResolverMain,
  rootDir: string,
  rootComponents: string[],
  componentDirectoryMap: ComponentMap<string>
): Promise<Record<string, string>> {
  const rootComponentIds = Array.from(componentDirectoryMap.hashMap.entries())
    .filter(([, [comp]]) => {
      const component = comp.state._consumer;
      const name = componentIdToPackageName({ withPrefix: true, ...component, id: component.id });
      return rootComponents.includes(name);
    })
    .map(([id]) => id);
  const pickedComponents = new Map<string, Record<string, any>>();
  const deps = await pickComponentsAndAllDeps(depResolver, rootComponentIds, componentDirectoryMap, pickedComponents);
  const rootComponentsDir = path.join(rootDir, '.root-components');
  await Promise.all(
    Array.from(pickedComponents.entries()).map(async ([rootComponentDir, packageJson]) => {
      const rel = path.relative(rootDir, rootComponentDir);
      const targetDir = path.join(rootComponentsDir, rel);
      const modulesDir = path.join(rootComponentDir, 'node_modules');
      await fs.copy(rootComponentDir, targetDir, {
        filter: (src) => src !== modulesDir,
        overwrite: true,
      });
      if (rootComponents.includes(packageJson.name)) {
        packageJson.dependencies = {
          ...packageJson.peerDependencies,
          ...packageJson.dependencies,
        };
      }
      await fs.writeJson(path.join(targetDir, 'package.json'), packageJson, { spaces: 2 });
    })
  );
  const result = {};
  for (const rootComponentDir of deps) {
    const rel = path.relative(rootDir, rootComponentDir);
    const targetDir = path.join(rootComponentsDir, rel);
    const pkgJson = pickedComponents.get(rootComponentDir);
    if (pkgJson) {
      result[`${pkgJson.name}__root`] = `file:${path.relative(rootDir, targetDir)}`;
    }
  }
  return result;
}

async function pickComponentsAndAllDeps(
  depResolver: DependencyResolverMain,
  rootComponentIds: string[],
  componentDirectoryMap: ComponentMap<string>,
  pickedComponents: Map<string, Record<string, any>>
) {
  const dependencies: string[] = [];
  await Promise.all(
    rootComponentIds.map(async (rootComponentId) => {
      const component = componentDirectoryMap.hashMap.get(rootComponentId);
      if (component) {
        dependencies.push(component[1]);
        let packageJsonObject = pickedComponents.get(component[1]);
        if (!packageJsonObject) {
          packageJsonObject = PackageJsonFile.createFromComponent(
            component[1],
            component[0].state._consumer
          ).packageJsonObject;
          pickedComponents.set(component[1], packageJsonObject);
        }
        const depsList = await depResolver.getDependencies(component[0]);
        const deps = await pickComponentsAndAllDeps(
          depResolver,
          depsList.dependencies
            .filter((dep) => dep instanceof ComponentDependency)
            .map((dep: any) => dep.componentId.toString()),
          componentDirectoryMap,
          pickedComponents
        );
        for (const dep of deps) {
          const pkgJson = pickedComponents.get(dep);
          if (pkgJson) {
            packageJsonObject.dependencies[pkgJson.name] = `file:${path.relative(component[1], dep)}`;
          }
        }
      }
    })
  );
  return dependencies;
}
