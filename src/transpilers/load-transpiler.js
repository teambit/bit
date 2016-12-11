"use strict";
var path = require("path");
var constants = require("../constants");
var loadLocalBitJson = require("../bit/load-local-bit-json");

var TRANSPILERS_DIR = constants.TRANSPILERS_DIR;

var loadBitTranspiler = function (bitPath) {
  var getBitTranspilerName = function (bitJson) {
    return bitJson.transpiler;
  };

  var transpilerName = getBitTranspilerName(loadLocalBitJson(bitPath));
  if (!transpilerName) {
    return null;
  }

  try {
    return require(path.join(TRANSPILERS_DIR, transpilerName));
  } catch (e) {
    throw new Error("The transpiler \"" + transpilerName +
    "\" is not exists, please use \"bit install " + transpilerName +
    "\" or change the transpiler name in the \".bit.json\" file.");
  }
};

module.exports = loadBitTranspiler;
