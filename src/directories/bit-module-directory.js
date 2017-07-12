// @flow
import R from 'ramda';
import path from 'path';
import { BitId as ComponentId } from '../bit-id';
import LinksDirectory from './links-directory';
import Component from '../maps/component';
import { InlineComponentsMap, ComponentsMap } from '../maps';
import InlineComponent from '../maps/inline-component';
import Link from './link';
import MultiLink from './multi-link';
import {
  INLINE_COMPONENTS_DIRNAME,
  COMPONENTS_DIRNAME,
  COMPONENT_ORIGINS,
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

  addLinksFromBitMap(componentsMap) {
    const directDependencies = Object.keys(componentsMap)
      .filter(component => componentsMap[component].origin !== COMPONENT_ORIGINS.NESTED);
    const components = directDependencies.map((componentId) => {
      const componentIdParsed = ComponentId.parse(componentId);
      const sourceFile = this.getComponentFilePath({
        name: componentIdParsed.name,
        namespace: componentIdParsed.box,
      });

      const mainFile = componentsMap[componentId].mainFile;
      // todo: consider dist
      const mainFilePath = componentsMap[componentId].files[mainFile];

      if (!mainFilePath) {
        // todo: log a warning
        return null;
      }

      const destFile = path.join(this.rootPath, mainFilePath);

      this.addLink(
        Link.create({
          from: sourceFile,
          to: destFile,
        }),
      );
      return {
        namespace: componentIdParsed.box,
        name: componentIdParsed.name,
        scope: componentIdParsed.scope,
        version: componentIdParsed.version,
      };
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
