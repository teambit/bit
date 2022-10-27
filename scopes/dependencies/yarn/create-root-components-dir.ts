import fs from 'fs-extra';
import path from 'path';
import { ComponentDependency, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ComponentMap } from '@teambit/component';

/**
 * All components are copied to a temporary folder (`<workspace-root>/.bit_components`).
 * Each of the copies gets a `package.json` generated, where the component dependencies
 * from the workspace are declared using the `file:` protocol.
 * Every workspace component is then referenced from the `node_modules/<pkgname>` directory (using the `file:` protocol).
 * The peer dependencies of the components are added as runtime dependencies of `node_modules/<pkgname>`.
 *
 * This way Yarn will install each workspace component in isolation with its component dependencies and peer dependencies
 * inside `node_modules/<pkgName>/node_modules`.
 */
export async function createRootComponentsDir({
  depResolver,
  rootDir,
  componentDirectoryMap,
}: {
  depResolver: DependencyResolverMain;
  rootDir: string;
  componentDirectoryMap: ComponentMap<string>;
}): Promise<Record<string, object>> {
  const pickedComponents = new Map<string, Record<string, any>>();
  const deps = await pickComponentsAndAllDeps(
    depResolver,
    Array.from(componentDirectoryMap.hashMap.keys()),
    componentDirectoryMap,
    pickedComponents,
    rootDir
  );
  const copiesDir = path.join(rootDir, 'node_modules/.bit_components');
  await Promise.all(
    Array.from(pickedComponents.entries()).map(async ([rootComponentDir, packageJson]) => {
      const rel = path.relative(rootDir, rootComponentDir);
      const targetDir = path.join(copiesDir, rel);
      const modulesDir = path.join(rootComponentDir, 'node_modules');
      await fs.copy(rootComponentDir, targetDir, {
        filter: (src) => src !== modulesDir,
        overwrite: true,
      });
      await fs.writeJson(path.join(targetDir, 'package.json'), packageJson, { spaces: 2 });
    })
  );
  const newManifestsByPaths: Record<string, object> = {};
  for (const rootComponentDir of deps) {
    const rel = path.relative(rootDir, rootComponentDir);
    const targetDir = path.join(copiesDir, rel);
    const pkgJson = pickedComponents.get(rootComponentDir);
    if (pkgJson) {
      const compDir = path.join(rootDir, 'node_modules', pkgJson.name);
      newManifestsByPaths[compDir] = {
        name: pkgJson.name,
        dependencies: {
          [pkgJson.name]: `file:${path.relative(compDir, targetDir)}`,
          ...pkgJson.peerDependencies,
          ...pkgJson['defaultPeerDependencies'], // eslint-disable-line
        },
        // is it needed?
        installConfig: {
          hoistingLimits: 'dependencies',
        },
      };
    }
  }
  return newManifestsByPaths;
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
        const depsList = await depResolver.getDependencies(component[0]);
        const deps = await pickComponentsAndAllDeps(
          depResolver,
          depsList.dependencies
            .filter((dep) => dep instanceof ComponentDependency)
            .map((dep: any) => dep.componentId.toString()),
          componentDirectoryMap,
          pickedComponents,
          rootDir
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
