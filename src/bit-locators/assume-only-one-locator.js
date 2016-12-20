const glob = require('glob');
const path = require('path');

module.exports = (bitsDir, boxname, bitname) => {
  const directoryToLookIn = path.join(bitsDir, boxname, bitname);
  const files = glob.sync(`${directoryToLookIn}/**/dist/bundle.js`);
  if (files.length === 0) {
    throw new Error(`bit-node could not find ${boxname}/${bitname}`);
  }

  return files[0];
};
