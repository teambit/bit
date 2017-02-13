const path = require('path');
const glob = require('glob');
const { BITS_DIRNAME } = require('../constants');
const { VersionNotExistsException } = require('../exceptions');

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
    const id = `${scope}/${box}/${name}::latest`;
    throw new VersionNotExistsException(id);
  }

  return Math.max(...versions).toString();
};
