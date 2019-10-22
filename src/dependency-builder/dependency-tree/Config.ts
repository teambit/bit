/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const path = require('path');
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const debug = require('debug')('tree');

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
function Config(options) {
  // @ts-ignore FIXME
  this.filename = options.filename;
  // @ts-ignore FIXME
  this.directory = options.directory || options.root;
  // @ts-ignore FIXME
  this.visited = options.visited || {};
  // @ts-ignore FIXME
  this.errors = options.errors || {};
  // @ts-ignore FIXME
  this.nonExistent = options.nonExistent || [];
  // @ts-ignore FIXME
  this.isListForm = options.isListForm;
  // @ts-ignore FIXME
  this.requireConfig = options.config || options.requireConfig;
  // @ts-ignore FIXME
  this.webpackConfig = options.webpackConfig;
  // @ts-ignore FIXME
  this.detectiveConfig = options.detective || options.detectiveConfig || {};
  // @ts-ignore FIXME
  this.pathMap = options.pathMap || [];
  // @ts-ignore FIXME
  this.resolveConfig = options.resolveConfig;
  // @ts-ignore FIXME
  this.cacheProjectAst = options.cacheProjectAst;

  // @ts-ignore FIXME
  this.filter = options.filter;

  // @ts-ignore FIXME
  if (!this.filename) {
    throw new Error('filename not given');
  }
  // @ts-ignore FIXME
  if (!this.directory) {
    throw new Error('directory not given');
  }
  // @ts-ignore FIXME
  // @ts-ignore FIXME
  if (this.filter && typeof this.filter !== 'function') {
    throw new Error('filter must be a function');
  }

  // @ts-ignore FIXME
  debug(`given filename: ${this.filename}`);

  // @ts-ignore FIXME
  // @ts-ignore FIXME
  this.filename = path.resolve(process.cwd(), this.filename);

  // @ts-ignore FIXME
  debug(`resolved filename: ${this.filename}`);
  // @ts-ignore FIXME
  debug('visited: ', this.visited);
}

Config.prototype.clone = function() {
  return new Config(this);
};

module.exports = Config;
