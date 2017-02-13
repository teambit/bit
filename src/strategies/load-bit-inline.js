const fs = require('fs');
const path = require('path');
const Bit = require('../bit/bit');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = consumer.getInlineDir();
  const inlinePath = path.join(directoryToLookIn, boxName, bitName);
  if (!fs.existsSync(inlinePath)) return;
  const bit = new Bit(inlinePath, consumer);
  return bit.getImpl(); // eslint-disable-line
};
