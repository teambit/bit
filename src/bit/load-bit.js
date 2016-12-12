const camelcase = require('camelcase');
const getbitImpl = require('./load-impl');

const getName = (bitPath) => {
  const parts = bitPath.split('/');
  return camelcase(parts[parts.length - 1]);
};

const loadBit = (bitPath) => {
  try {
    return {
      name: getName(bitPath),
      ref: getbitImpl(bitPath),
    };
  } catch (e) {
    console.error(e); // eslint-disable-line
    return {};
  }
};

module.exports = loadBit;
