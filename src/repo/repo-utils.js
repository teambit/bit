const fs = require('fs');
const path = require('path');
const { BIT_DIR_NAME } = require('../constants');

const composeRepoPath = p => path.join(p, BIT_DIR_NAME);
const pathHasRepo = p => fs.existsSync(composeRepoPath(p));

module.exports = {
  pathHasRepo,
  composeRepoPath,
};
