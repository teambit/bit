const getbitImpl = require('./load-impl');
const fs = require('fs');
const path = require('path');
const BitNotExistsException = require('../exceptions/bit-not-exists');

// const camelcase = require('camelcase');
// const getName = (bitPath) => {
//   const parts = bitPath.split('/');
//   return camelcase(parts[parts.length - 1]);
// };

const composeInlinePath = (bitDir, bitName) => path.join(bitDir, 'inline', bitName);
const composeExternalPath = (bitDir, bitName) => path.join(bitDir, 'external', bitName);

const findBitInBitsDir = (bitName, bitDir) => {
  const bitInBitsDir = path.join(bitDir, bitName);
  const bitInInlineDir = composeInlinePath(bitDir, bitName);
  const bitInExternalDir = composeExternalPath(bitDir, bitName);

  if (fs.existsSync(bitInBitsDir)) {
    return bitInBitsDir;
  } else if (fs.existsSync(bitInInlineDir)) {
    return bitInInlineDir;
  } else if (fs.existsSync(bitInExternalDir)) {
    return bitInExternalDir;
  }

  throw new BitNotExistsException();
};

const loadBit = (bitPath) => {
  try {
    return getbitImpl(bitPath);
  } catch (e) {
    console.error(e); // eslint-disable-line
    return null;
  }
};

module.exports = loadBit;
