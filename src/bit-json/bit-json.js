const R = require('ramda');
const fs = require('fs');
const path = require('path');
const { BIT_JSON_NAME } = require('../constants');
const DependencyMap = require('../dependency-map');

class BitJson {
  constructor(bitJson) {
    this.name = R.prop('name', bitJson);
    this.box = R.prop('box', bitJson);
    this.version = R.prop('version', bitJson);
    this.impl = R.path(['sources', 'impl'], bitJson);
    this.spec = R.path(['sources', 'spec'], bitJson);
    this.compiler = R.path(['env', 'compiler'], bitJson);
    this.tester = R.path(['env', 'tester'], bitJson);
    this.remotes = R.prop('remotes', bitJson);
    this.dependencies = R.prop('dependencies', bitJson);
    this.dependencyMap = null;
  }

  getName() {
    return this.name;
  }

  getBox() {
    return this.box;
  }

  getVersion() {
    return this.version;
  }

  getImpl() {
    return this.impl;
  }

  getSpec() {
    return this.spec;
  }

  getCompiler() {
    return this.compiler;
  }

  getTester() {
    return this.tester;
  }

  getRemotes() {
    return this.remotes;
  }

  getDependencies() {
    return this.dependencies;
  }

  populateDependencyMap(consumerPath) {
    this.dependencyMap = DependencyMap.load(this.dependencies, consumerPath);
  }

  getDependencyMap(consumerPath) {
    if (!this.dependencyMap) {
      this.populateDependencyMap(consumerPath);
    }

    return this.dependencyMap.getDependencies();
  }

  static load(bitPath) {
    const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
    const composeBitJsonPath = p => path.join(p, BIT_JSON_NAME);
    const readBitJson = p => readJson(composeBitJsonPath(p));
    return new BitJson(readBitJson(bitPath));
  }
}

module.exports = BitJson;
