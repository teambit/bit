module.exports = (bitId) => {
  const splitted = bitId.split('/');
  let bitName;
  let boxName;

  if (splitted.length === 1) {
    bitName = splitted[0];
    boxName = 'global';
  } else if (splitted.length === 2) {
    bitName = splitted[0];
    boxName = splitted[1];
  } else throw new Error('bit id must consist of "name" or "box/name" pattern');

  return { bitName, boxName };
};
