// @flow
import path from 'path';
import R from 'ramda';
import { BitId as ComponentId } from 'bit-scope-client/bit-id';
import LinksDirectory from './links-directory';
import { COMPONENTS_DIRNAME, MODULES_DIR, MODULE_NAME, INDEX_JS } from '../constants';
import { ComponentsMap } from '../maps';
import Component from '../maps/component';
import Link from './link';

export default class ComponentsDirectory extends LinksDirectory {
  constructor(rootPath: string) {
    super(rootPath, COMPONENTS_DIRNAME);
  }

  getComponentFilePath({ name, namespace, parentComponent }: {
    name: string, namespace: string, parentComponent: Component,
  }) {
    return path.join(
      this.path,
      parentComponent.path,
      MODULES_DIR,
      MODULE_NAME,
      namespace,
      name,
      INDEX_JS,
    );
  }

  addLinksToDependencies(componentsMap: ComponentsMap): void {
    componentsMap.forEach((parentComponent: Component) => {
      const dependencies = parentComponent.dependencies.map((dependency: string) => {
        const componentId = ComponentId.parse(dependency);
        const component = componentsMap.getComponent(componentId);

        if (R.isNil(component)) return null;

        const sourceFile = this.getComponentFilePath({
          parentComponent,
          name: component.name,
          namespace: component.namespace,
        });

        const destFile = path.join(
          this.rootPath,
          COMPONENTS_DIRNAME,
          component.filePath,
        );

        this.addLink(
          Link.create({
            from: sourceFile,
            to: destFile,
          }),
        );
        return component;
      });
      this.addLinksForNamespacesAndRoot(dependencies, parentComponent);
    });
  }
}
