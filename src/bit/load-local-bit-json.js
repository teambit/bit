"use strict";

var fs = require("fs");
var path = require("path");
var LOCAL_BIT_JSON_NAME = require("../constants").LOCAL_BIT_JSON_NAME;

var loadLocalBitJson = function (bitPath) {
  var bitJsonPath = path.join(bitPath, LOCAL_BIT_JSON_NAME);
  return JSON.parse(fs.readFileSync(bitJsonPath, "utf8"));
};

module.exports = loadLocalBitJson;
