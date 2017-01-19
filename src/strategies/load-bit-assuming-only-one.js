const glob = require('glob');
const path = require('path');
const resolveBit = require('../bit-resolver');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = path.join(consumer.getBitsDir(), boxName, bitName);
  const optionalBits = glob.sync(`${directoryToLookIn}/*/*`);
  if (optionalBits.length === 1) {
    return resolveBit(optionalBits[0]);
  }
};
