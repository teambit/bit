// @flow
import R from 'ramda';
import path from 'path';
import AbstractLink from './abstract-link';
import { removeDirP } from '../utils';


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
}
