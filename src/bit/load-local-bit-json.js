const fs = require('fs');
const path = require('path');
const { LOCAL_BIT_JSON_NAME } = require('../constants');

const loadLocalBitJson = (bitPath) => {
  const bitJsonPath = path.join(bitPath, LOCAL_BIT_JSON_NAME);
  return JSON.parse(fs.readFileSync(bitJsonPath, 'utf8'));
};

module.exports = loadLocalBitJson;
