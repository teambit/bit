// @flow
import path from 'path';
import R from 'ramda';
import { BitId as ComponentId } from 'bit-scope-client/bit-id';
import LinksDirectory from './links-directory';
import Link from './link';
import {
  INLINE_COMPONENTS_DIRNAME,
  INDEX_JS,
  COMPONENTS_DIRNAME,
  MODULES_DIR,
  MODULE_NAME,
} from '../constants';
import { ComponentsMap, InlineComponentsMap } from '../maps';
import InlineComponent from '../maps/inline-component';

export default class InlineComponentsDirectory extends LinksDirectory {
  constructor(rootPath: string) {
    super(rootPath, INLINE_COMPONENTS_DIRNAME);
  }

  getComponentFilePath({ name, namespace, parentComponent }: {
    name: string, namespace: string, parentComponent: InlineComponent,
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

  addLinksToDependencies(
    inlineComponentMap: InlineComponentsMap,
    componentsMap: ComponentsMap,
  ): void {
    inlineComponentMap.forEach((parentComponent) => {
      const dependencies = parentComponent.dependencies.map((dependency) => {
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
