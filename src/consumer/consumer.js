const path = require('path');
const { readDependenciesMap } = require('./consumer-utils');
const { INLINE_BITS_DIRNAME, BITS_DIRNAME } = require('../constants.js');
const BitJson = require('bit-scope-client/bit-json');

class Consumer {
  constructor(consumerPath) {
    this.bitJson = null;
    this.dependenciesMap = null;
    this.consumerPath = consumerPath;
  }

  getPath() {
    return this.consumerPath;
  }

  getBitJson() {
    if (!this.bitJson) {
      return this.populateAndGetBitJson();
    }

    return this.bitJson;
  }

  populateAndGetBitJson() {
    this.bitJson = BitJson.load(this.consumerPath);
    return this.bitJson;
  }

  getDependenciesMap() {
    if (!this.dependenciesMap) {
      return this.populateAndGetDependenciesMap();
    }

    return this.dependenciesMap;
  }

  populateAndGetDependenciesMap() {
    this.dependenciesMap = readDependenciesMap(this.consumerPath);
    return this.dependenciesMap;
  }

  getBitsDir() {
    return path.join(this.consumerPath, BITS_DIRNAME);
  }

  getInlineDir() {
    return path.join(this.consumerPath, INLINE_BITS_DIRNAME);
  }
}

module.exports = Consumer;
