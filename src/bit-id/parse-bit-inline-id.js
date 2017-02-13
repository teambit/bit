const { ID_DELIMITER, DEFAULT_BOXNAME } = require('../constants');
const { InvalidComponentIdException } = require('../exceptions');

module.exports = (bitId) => {
  const splitted = bitId.split(ID_DELIMITER);
  let boxName;
  let bitName;

  if (splitted.length === 1) {
    bitName = splitted[0];
    boxName = DEFAULT_BOXNAME;
  } else if (splitted.length === 2) {
    bitName = splitted[1];
    boxName = splitted[0];
  } else throw new InvalidComponentIdException(bitId);
  return { bitName, boxName };
};
