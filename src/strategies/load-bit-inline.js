const glob = require('glob');
const path = require('path');
const Bit = require('../bit/bit');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = consumer.getInlineDir();
  const files = glob.sync(path.join(directoryToLookIn, boxName, bitName));
  if (files.length === 0) return;

  if (files.length > 1) {
    throw new Error(`Found more than one component with the same ID in the inline directory ${files}`);
  }

  const bit = new Bit(files[0], consumer);
  return bit.getImpl(); // eslint-disable-line
};
