/** @flow */
import FsGateway from './fs-gateway';

export default class Repository {
  path: string;
  createdNow: boolean;

  static load(path: string, created: boolean): Repository {
    return new Repository(path, created);
  }

  constructor(path: string, createdNow: boolean) {
    this.path = path;
    this.createdNow = createdNow;
  }

  static create(path: string): Repository {
    const created = FsGateway.createRepoFiles(path);
    return this.load(path, created); 
  }
}
