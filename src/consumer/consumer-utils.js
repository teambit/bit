const fs = require('fs');
const path = require('path');
const { COMPONENTS_DIRNAME, INLINE_COMPONENTS_DIRNAME, BIT_JSON_NAME } = require('../constants');

const composeBitJsonPath = p => path.join(p, BIT_JSON_NAME);
const composeComponentsPath = p => path.join(p, COMPONENTS_DIRNAME);
const composeInlineComponentsPath = p => path.join(p, INLINE_COMPONENTS_DIRNAME);

// const pathHasBitJson = p => fs.existsSync(composeBitJsonPath(p));
const pathHasComponentsDir = p => fs.existsSync(composeComponentsPath(p));
const pathHasInlineComponentsDir = p => fs.existsSync(composeInlineComponentsPath(p));

const pathHasConsumer = p => (pathHasComponentsDir(p) || pathHasInlineComponentsDir(p));

module.exports = {
  pathHasConsumer,
  composeBitJsonPath,
};
