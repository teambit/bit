// @flow
import R from 'ramda';
import path from 'path';
import { BitId as ComponentId } from 'bit-scope-client/bit-id';
import LinksDirectory from './links-directory';
import Component from '../maps/component';
import { InlineComponentsMap, ComponentsMap } from '../maps';
import InlineComponent from '../maps/inline-component';
import Link from './link';
import MultiLink from './multi-link';
import {
  INLINE_COMPONENTS_DIRNAME,
  COMPONENTS_DIRNAME,
  MODULES_DIR,
  MODULE_NAME,
  INDEX_JS,
} from '../constants';

const bitModuleRelativePath = path.join(MODULES_DIR, MODULE_NAME);

export default class BitModuleDirectory extends LinksDirectory {
  linkedComponents: Component[];

  constructor(rootPath: string) {
    super(rootPath, bitModuleRelativePath);
    this.linkedComponents = [];
  }

  getComponentFilePath({ name, namespace }: { name: string, namespace: string }) {
    return path.join(this.path, namespace, name, INDEX_JS);
  }

  getNamespaceFilePath(namespace: string) {
    return path.join(this.path, namespace, INDEX_JS);
  }

  async addNamespaceLinks(componentsMap: ComponentsMap) {
    componentsMap.forEachNamespace((namespace: string, components: Component[]) => {
      this.addLink(
        MultiLink.create({
          from: this.getNamespaceFilePath(namespace),
          names: R.uniq(components.map(c => c.name)),
        }),
      );
    });
  }

  addLinksFromInlineComponents(
    inlineMap: InlineComponentsMap,
  ): InlineComponent[] {
    const inlineComponents = inlineMap.map((inlineComponent: InlineComponent) => {
      const sourceFile = this.getComponentFilePath({
        name: inlineComponent.name,
        namespace: inlineComponent.namespace,
      });

      const destFile = path.join(
        this.rootPath,
        INLINE_COMPONENTS_DIRNAME,
        inlineComponent.filePath,
      );

      this.addLink(
        Link.create({
          from: sourceFile,
          to: destFile,
        }),
      );

      return inlineComponent;
    });

    this.linkedComponents = this.linkedComponents.concat(inlineComponents);
    return inlineComponents;
  }

  addLinksFromProjectDependencies(
    componentsMap: ComponentsMap,
    dependenciesArray: string[],
  ): Component[] {
    const components = dependenciesArray.map((componentIdStr: string) => {
      const componentId = ComponentId.parse(componentIdStr);
      const component = componentsMap.getComponent(componentId);

      const sourceFile = this.getComponentFilePath({
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

    this.linkedComponents = this.linkedComponents.concat(components);
    return components;
  }

  addLinksFromStageComponents(
    componentsMap: ComponentsMap,
  ): Component[] {
    const components = componentsMap.getLatestStagedComponents().map((component) => {
      const sourceFile = this.getComponentFilePath({
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
    this.linkedComponents = this.linkedComponents.concat(components);
    return components;
  }

  addLinksForNamespacesAndRoot() {
    if (!this.linkedComponents.length) return;
    const namespaceMap = {};
    this.linkedComponents.forEach((component) => {
      if (namespaceMap[component.namespace]) namespaceMap[component.namespace].push(component.name);
      else namespaceMap[component.namespace] = [component.name];
    });

    Object.keys(namespaceMap).forEach((namespace) => {
      this.addLink(
        MultiLink.create({
          from: path.join(this.path, namespace, INDEX_JS),
          names: namespaceMap[namespace],
        }),
      );
    });
    this.addLink(
      MultiLink.create({
        from: path.join(this.path, INDEX_JS),
        names: Object.keys(namespaceMap),
      }),
    );
  }
}
