/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */

import path from 'path';
import debugFactory from 'debug';
import type { DependencyDetector } from '@teambit/dependency-resolver';

const debug = debugFactory('tree');

export default class Config {
  filename: string;
  directory: string;
  visited: Record<string, any>;
  errors: Record<string, any>;
  nonExistent: Record<string, string[]>;
  isListForm?: boolean;
  requireConfig?: Record<string, any>;
  webpackConfig?: Record<string, any>;
  detectiveConfig: Record<string, any>;
  pathMap: Array<Record<string, any>>;
  resolveConfig?: Record<string, any>;
  cacheProjectAst?: boolean;
  envDetectors?: DependencyDetector[];
  filter?: (filePath: string, filename: string) => boolean;

  constructor(options) {
    this.filename = options.filename;
    this.directory = options.directory || options.root;
    this.visited = options.visited || {};
    this.errors = options.errors || {};
    this.nonExistent = options.nonExistent || [];
    this.isListForm = options.isListForm;
    this.requireConfig = options.config || options.requireConfig;
    this.webpackConfig = options.webpackConfig;
    this.detectiveConfig = options.detective || options.detectiveConfig || {};
    this.pathMap = options.pathMap || [];
    this.resolveConfig = options.resolveConfig;
    this.cacheProjectAst = options.cacheProjectAst;
    this.envDetectors = options.envDetectors;

    this.filter = options.filter;

    if (!this.filename) {
      throw new Error('filename not given');
    }
    if (!this.directory) {
      throw new Error('directory not given');
    }
    if (this.filter && typeof this.filter !== 'function') {
      throw new Error('filter must be a function');
    }

    debug(`given filename: ${this.filename}`);

    this.filename = path.resolve(process.cwd(), this.filename);

    debug(`resolved filename: ${this.filename}`);
    debug('visited: ', this.visited);
  }

  clone() {
    return new Config(this);
  }
}
