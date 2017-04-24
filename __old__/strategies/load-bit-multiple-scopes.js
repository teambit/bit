const glob = require('glob');
const path = require('path');
const { MultipleScopesNoDefException } = require('../exceptions');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = path.join(consumer.getBitsDir(), boxName, bitName);
  const optionalScopes = glob.sync(path.join(directoryToLookIn, '*'));
  if (optionalScopes.length > 1) {
    throw new MultipleScopesNoDefException(directoryToLookIn);
  }

  return null;
};
