const fs = require('fs');
const path = require('path');
const loadCompiler = require('../compilers/load-compiler');
const requireFromString = require('require-from-string');
const { NO_PLUGIN_TYPE } = require('../constants');
const BitJson = require('../bit-json');

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
    this.bitJson = BitJson.load(this.bitPath);
    return this.bitJson;
  }

  getImpl() {
    let implBasename;
    let compilerName;

    try {
      implBasename = this.getBitJson().getImpl();
    } catch (e) {
      implBasename = this.consumer.getBitJson().getImpl();
    }

    const implFilePath = path.join(this.getPath(), implBasename);

    try {
      compilerName = this.getBitJson().getCompiler();
    } catch (e) {
      try {
        compilerName = this.consumer.getBitJson().getCompiler();
      } catch (err) {
        compilerName = NO_PLUGIN_TYPE;
      }
    }

    if (compilerName === NO_PLUGIN_TYPE) return require(implFilePath); // eslint-disable-line

    const compiler = loadCompiler(compilerName, this.consumer);
    const rawImpl = fs.readFileSync(implFilePath, 'utf8');
    return requireFromString(compiler.compile(rawImpl).code, implFilePath);
  }
}

module.exports = Bit;
