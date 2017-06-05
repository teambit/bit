// @flow
import R from 'ramda';
import path from 'path';
import AbstractLink from './abstract-link';
import { removeDirP } from '../utils';
import MultiLink from './multi-link';
import { INDEX_JS, MODULES_DIR, MODULE_NAME } from '../constants';

export default class Directory {
  rootPath: string;
  relativePath: string;
  links: {[string]: AbstractLink};

  constructor(rootPath: string, relativePath: string) {
    this.rootPath = rootPath;
    this.relativePath = relativePath;
    this.links = {};
  }

  get path(): string {
    return path.join(this.rootPath, this.relativePath);
  }

  addLink(link: AbstractLink): boolean {
    if (Object.hasOwnProperty.call(this.links, link.from)) return false;
    this.links[link.from] = link;
    return true;
  }

  async persist(): Promise<any> {
    return Promise.all(R.values(this.links).map(link => link.persist()));
  }

  async erase(): Promise<any> {
    return removeDirP(this.path);
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
      const namespacePath = path.join(this.path, parentComponent.path, MODULES_DIR, MODULE_NAME,
        namespace, INDEX_JS,
      );
      this.addLink(
        MultiLink.create({
          from: namespacePath,
          names: namespaceMap[namespace],
        }),
      );
    });
    const rootPath = path.join(this.path, parentComponent.path, MODULES_DIR, MODULE_NAME, INDEX_JS);
    this.addLink(
      MultiLink.create({
        from: rootPath,
        names: Object.keys(namespaceMap),
      }),
    );
  }
}
