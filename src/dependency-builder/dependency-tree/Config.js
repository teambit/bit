/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */

const path = require('path');
const debug = require('debug')('tree');

function Config(options) {
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

Config.prototype.clone = function () {
  return new Config(this);
};

module.exports = Config;
