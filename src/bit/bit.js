const fs = require('fs');
const path = require('path');
const loadTranspiler = require('../transpilers/load-transpiler');
const { readBitJson } = require('../consumer/consumer-utils');
const requireFromString = require('require-from-string');
const { NO_TRANSPILER_TYPE } = require('../constants');

class Bit {
  constructor(bitPath, consumer) {
    this.bitJson = null;
    this.bitPath = bitPath;
    this.consumer = consumer;
  }

  getPath() {
    return this.bitPath;
  }

  getBitJson() {
    if (!this.bitJson) { return this.populateAndGetBitJson(); }

    return this.bitJson;
  }

  populateAndGetBitJson() {
    this.bitJson = readBitJson(this.bitPath);
    return this.bitJson;
  }

  getImpl() {
    const implFileBasename = this.getBitJson().impl || this.consumer.getBitJson().impl;
    const implFilePath = path.join(this.getPath(), implFileBasename);
    const transpilerName = this.getBitJson().transpiler || this.consumer.getBitJson().transpiler;
    if (transpilerName === NO_TRANSPILER_TYPE) return require(implFilePath); // eslint-disable-line
    const transpiler = loadTranspiler(transpilerName);
    const rawImpl = fs.readFileSync(implFilePath, 'utf8');
    return requireFromString(transpiler.transpile(rawImpl).code, implFilePath);
  }
}

module.exports = Bit;
