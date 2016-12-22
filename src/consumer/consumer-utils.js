const fs = require('fs');
const path = require('path');
const { LOCAL_SCOPE_DIRNAME, BIT_JSON_NAME, DEPENDENCIES_MAP_NAME } = require('../constants');

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const composeBitJsonPath = p => path.join(p, BIT_JSON_NAME);
const composeLocalScopePath = p => path.join(p, LOCAL_SCOPE_DIRNAME);
const composeDependenciesMapPath = p => path.join(composeLocalScopePath(p), DEPENDENCIES_MAP_NAME);

const pathHasBitJson = p => fs.existsSync(composeBitJsonPath(p));
const pathHasLocalScope = p => fs.existsSync(composeLocalScopePath(p));

const pathHasConsumer = p => pathHasBitJson(p) && pathHasLocalScope(p);
const readBitJson = p => readJson(composeBitJsonPath(p));
const readDependenciesMap = p => readJson(composeDependenciesMapPath(p));

module.exports = {
  pathHasConsumer,
  composeBitJsonPath,
  composeLocalScopePath,
  composeDependenciesMapPath,
  readBitJson,
  readDependenciesMap,
};
