// @flow
import path from 'path';
import R from 'ramda';
import { BitId as ComponentId } from '../bit-id';
import LinksDirectory from './links-directory';
import { MODULES_DIR, MODULE_NAME, INDEX_JS } from '../constants';
import type { ComponentMap } from '../bit-map/bit-map';
import Link from './link';
import MultiLink from './multi-link';

export default class ComponentsDirectory extends LinksDirectory {

  getComponentFilePath({ name, namespace, parentComponent }: {
    name: string, namespace: string, parentComponent: ComponentMap,
  }): string {
    return path.join(
      this.rootPath,
      parentComponent.path,
      MODULES_DIR,
      MODULE_NAME,
      namespace,
      name,
      INDEX_JS,
    );
  }

  addLinksForNamespacesAndRoot(dependencies, parentComponent) {
    dependencies = R.reject(R.isNil, dependencies); // eslint-disable-line
    if (!dependencies.length) return;
    const namespaceMap = {};
    dependencies.forEach((component) => {
      if (namespaceMap[component.namespace]) namespaceMap[component.namespace].push(component.name);
      else namespaceMap[component.namespace] = [component.name];
    });
    Object.keys(namespaceMap).forEach((namespace) => {
      const namespacePath = path.join(this.rootPath, parentComponent.path, MODULES_DIR, MODULE_NAME,
        namespace, INDEX_JS,
      );
      this.addLink(
        MultiLink.create({
          from: namespacePath,
          names: namespaceMap[namespace],
        }),
      );
    });
    const rootPath = path.join(this.rootPath, parentComponent.path, MODULES_DIR, MODULE_NAME, INDEX_JS);
    this.addLink(
      MultiLink.create({
        from: rootPath,
        names: Object.keys(namespaceMap),
      }),
    );
  }

  addLinksToDependencies(componentsMap: ComponentMap[]): void {
    Object.keys(componentsMap).forEach((parentComponentId: string) => {
      const parentComponent: ComponentMap = componentsMap[parentComponentId];
      if (!parentComponent.dependencies) return;
      const parentMainFile = parentComponent.files[parentComponent.mainFile];
      parentComponent.path = parentComponent.rootDir || path.dirname(parentMainFile);
      const dependencies = parentComponent.dependencies.map((dependencyIdStr: string) => {
        const dependencyId = ComponentId.parse(dependencyIdStr);
        const dependency = componentsMap[dependencyIdStr];
        if (!dependency) return null; // todo: log error

        const sourceFile = this.getComponentFilePath({
          parentComponent,
          name: dependencyId.name,
          namespace: dependencyId.box,
        });

        // todo: consider dist
        const dependencyMainFile = dependency.files[dependency.mainFile];
        const destFile = path.join(
          this.rootPath,
          dependencyMainFile,
        );

        this.addLink(
          Link.create({
            from: sourceFile,
            to: destFile,
          }),
        );
        return {
          namespace: dependencyId.box,
          name: dependencyId.name,
          scope: dependencyId.scope,
          version: dependencyId.version,
        };
      });
      this.addLinksForNamespacesAndRoot(dependencies, parentComponent);
    });
  }
}
