const { ID_DELIMITER, DEFAULT_BOXNAME } = require('../constants');

module.exports = (bitId) => {
  const splitted = bitId.split(ID_DELIMITER);
  let bitName;
  let boxName;

  if (splitted.length === 1) {
    bitName = splitted[0];
    boxName = DEFAULT_BOXNAME;
  } else if (splitted.length === 2) {
    bitName = splitted[0];
    boxName = splitted[1];
  } else throw new Error('bit id must consist of "name" or "box/name" pattern');

  return { bitName, boxName };
};
