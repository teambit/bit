const glob = require('glob');
const path = require('path');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = path.join(consumer.getBitsDir(), boxName, bitName);
  const files = glob.sync(`${directoryToLookIn}/**/dist/bundle.js`);
  if (files.length === 0) {
    return;
  }

  return require(files[0]); // eslint-disable-line
};
