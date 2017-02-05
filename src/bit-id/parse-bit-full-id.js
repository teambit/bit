const {
  VERSION_DELIMITER,
  ID_DELIMITER,
  DEFAULT_BOXNAME } = require('../constants');

module.exports = (id, version) => {
  if (!version) {
    const idAndVersion = id.split(VERSION_DELIMITER);
    id = idAndVersion[0]; // eslint-disable-line
    version = idAndVersion[1]; // eslint-disable-line
  }

  if (!id || !version) { throw new Error(`invalid component id ${id}`); }
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

  return { scope, box, name, version };
};
