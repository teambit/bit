const fs = require('fs');
const path = require('path');
const { BIT_DIR_NAME } = require('../constants');

const composeBitsDirPath = p => path.join(p, BIT_DIR_NAME);
const pathHasBitsDir = p => fs.existsSync(composeBitsDirPath(p));

module.exports = {
  pathHasBitsDir,
  composeBitsDirPath,
};
