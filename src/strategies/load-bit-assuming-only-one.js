const glob = require('glob');
const path = require('path');

const { DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME } = '../constants';

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = path.join(consumer.getBitsDir(), boxName, bitName);
  const files = glob.sync(`${directoryToLookIn}/**/${DEFAULT_DIST_DIRNAME}/${DEFAULT_BUNDLE_FILENAME}`);
  if (files.length === 0) {
    return;
  }

  return require(files[0]); // eslint-disable-line
};
