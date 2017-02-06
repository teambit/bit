const path = require('path');
const glob = require('glob');
const {
  VERSION_DELIMITER,
  ID_DELIMITER,
  DEFAULT_BOXNAME,
  LATEST_VERSION,
  BITS_DIRNAME } = require('../constants');

const findLatestVersion = ({ scope, box, name, consumerPath }) => {
  const dirToLookIn = path.join(
    consumerPath,
    BITS_DIRNAME,
    box,
    name,
    scope,
  );

  const files = glob.sync(path.join(dirToLookIn, '*'));
  const versions = files.map(file => parseInt(path.basename(file), 10));

  return Math.max(...versions).toString();
};

module.exports = ({ id, version, consumerPath }) => {
  if (!version) {
    const idAndVersion = id.split(VERSION_DELIMITER);
    id = idAndVersion[0]; // eslint-disable-line
    version = idAndVersion[1]; // eslint-disable-line
  }

  if (!id) { throw new Error(`invalid component id ${id}`); }
  const splitted = id.split(ID_DELIMITER);
  let scope;
  let box = DEFAULT_BOXNAME;
  let name;

  if (splitted.length === 3) {
    scope = splitted[0].replace('@', '');
    box = splitted[1];
    name = splitted[2];
  } else if (splitted.length === 2) {
    scope = splitted[0].replace('@', '');
    name = splitted[1];
  } else { throw new Error(`invalid component id ${id}`); }

  if (!version || version === LATEST_VERSION) {
    version = findLatestVersion({ scope, box, name, consumerPath }); // eslint-disable-line
  }

  return { scope, box, name, version };
};
