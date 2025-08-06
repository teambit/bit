/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */

const path = require('path');
const debug = require('debug')('tree');

export default function Config(options) {
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.filename = options.filename;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.directory = options.directory || options.root;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.visited = options.visited || {};
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.errors = options.errors || {};
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.nonExistent = options.nonExistent || [];
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.isListForm = options.isListForm;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.requireConfig = options.config || options.requireConfig;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.webpackConfig = options.webpackConfig;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.detectiveConfig = options.detective || options.detectiveConfig || {};
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.pathMap = options.pathMap || [];
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.resolveConfig = options.resolveConfig;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.cacheProjectAst = options.cacheProjectAst;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.envDetectors = options.envDetectors;

  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.filter = options.filter;

  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!this.filename) {
    throw new Error('filename not given');
  }
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!this.directory) {
    throw new Error('directory not given');
  }
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (this.filter && typeof this.filter !== 'function') {
    throw new Error('filter must be a function');
  }

  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  debug(`given filename: ${this.filename}`);

  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.filename = path.resolve(process.cwd(), this.filename);

  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  debug(`resolved filename: ${this.filename}`);
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  debug('visited: ', this.visited);
}

Config.prototype.clone = function () {
  return new Config(this);
};
