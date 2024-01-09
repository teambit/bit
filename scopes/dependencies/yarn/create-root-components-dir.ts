import fs from 'fs-extra';
import path from 'path';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ComponentMap } from '@teambit/component';

/**
 * All components are copied to a temporary folder (`<workspace-root>/.bit_components`).
 */
export async function createRootComponentsDir({
  depResolver,
  rootDir,
  componentDirectoryMap,
}: {
  depResolver: DependencyResolverMain;
  rootDir: string;
  componentDirectoryMap: ComponentMap<string>;
}) {
  const pickedComponents = new Map<string, Record<string, any>>();
  await pickComponentsAndAllDeps(
    depResolver,
    Array.from(componentDirectoryMap.hashMap.keys()),
    componentDirectoryMap,
    pickedComponents,
    rootDir
  );
  const copiesDir = path.join(rootDir, 'node_modules/.bit_components');
  await Promise.all(
    Array.from(pickedComponents.entries()).map(async ([rootComponentDir, packageJson]) => {
      const targetDir = path.join(copiesDir, packageJson.name);
      const modulesDir = path.join(rootComponentDir, 'node_modules');
      await fs.copy(rootComponentDir, targetDir, {
        filter: (src) => src !== modulesDir,
        overwrite: true,
      });
      await fs.writeJson(path.join(targetDir, 'package.json'), packageJson, { spaces: 2 });
    })
  );
}

/**
 * This function generates a `package.json` for each component in the workspace.
 * Any component dependencies that are present in the workspace are added to the dependencies
 * as local `file:` dependencies.
 */
async function pickComponentsAndAllDeps(
  depResolver: DependencyResolverMain,
  rootComponentIds: string[],
  componentDirectoryMap: ComponentMap<string>,
  pickedComponents: Map<string, Record<string, any>>,
  rootDir: string
) {
  const dependencies: string[] = [];
  await Promise.all(
    rootComponentIds.map(async (rootComponentId) => {
      const component = componentDirectoryMap.hashMap.get(rootComponentId);
      if (component) {
        dependencies.push(component[1]);
        let packageJsonObject = pickedComponents.get(component[1]);
        if (!packageJsonObject) {
          const pkgName = depResolver.getPackageName(component[0]);
          packageJsonObject = JSON.parse(
            await fs.readFile(path.join(rootDir, 'node_modules', pkgName, 'package.json'), 'utf-8')
          ) as Record<string, any>;
          pickedComponents.set(component[1], packageJsonObject);
        }
      }
    })
  );
  return dependencies;
}
