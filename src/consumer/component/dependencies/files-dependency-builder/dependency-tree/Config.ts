/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */

const path = require('path');
const debug = require('debug')('tree');

export default function Config(options) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.filename = options.filename;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.directory = options.directory || options.root;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.visited = options.visited || {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.errors = options.errors || {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.nonExistent = options.nonExistent || [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.isListForm = options.isListForm;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.requireConfig = options.config || options.requireConfig;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.webpackConfig = options.webpackConfig;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.detectiveConfig = options.detective || options.detectiveConfig || {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.pathMap = options.pathMap || [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.resolveConfig = options.resolveConfig;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.cacheProjectAst = options.cacheProjectAst;

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.filter = options.filter;

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!this.filename) {
    throw new Error('filename not given');
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!this.directory) {
    throw new Error('directory not given');
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (this.filter && typeof this.filter !== 'function') {
    throw new Error('filter must be a function');
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  debug(`given filename: ${this.filename}`);

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  this.filename = path.resolve(process.cwd(), this.filename);

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  debug(`resolved filename: ${this.filename}`);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  debug('visited: ', this.visited);
}

Config.prototype.clone = function () {
  return new Config(this);
};
