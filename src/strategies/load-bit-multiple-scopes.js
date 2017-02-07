const glob = require('glob');
const path = require('path');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = path.join(consumer.getBitsDir(), boxName, bitName);
  const optionalScopes = glob.sync(path.join(directoryToLookIn, '*'));
  if (optionalScopes.length > 1) {
    throw new Error(`there are multiple scopes for the component "${directoryToLookIn}", please specify the component id in bit.json`);
  }

  return null;
};
