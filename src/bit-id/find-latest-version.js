const path = require('path');
const glob = require('glob');
const { BITS_DIRNAME } = require('../constants');

module.exports = ({ scope, box, name, consumerPath }) => {
  const dirToLookIn = path.join(
    consumerPath,
    BITS_DIRNAME,
    box,
    name,
    scope,
  );

  const files = glob.sync(path.join(dirToLookIn, '*'));
  const versions = files.map(file => parseInt(path.basename(file), 10));

  if (versions.length < 1) {
    const errorMessage = `fatal: you were looking for the component ${scope}/${box}/${name} in latest version which does not exists please use bit import first`;
    throw new Error(errorMessage);
  }

  return Math.max(...versions).toString();
};
