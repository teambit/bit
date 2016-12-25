const glob = require('glob');
const path = require('path');
const Bit = require('../bit/bit');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = consumer.getInlineDir();
  const files = glob.sync(path.join(directoryToLookIn, boxName, bitName));
  if (files.length === 0) return;

  if (files.length > 1) {
    throw new Error(`you have more than one bit with the same id in the inline directory ${files}`);
  }

  const bit = new Bit(files[0], consumer);
  return bit.getImpl(); // eslint-disable-line
};
