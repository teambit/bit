"use strict";

var path = require("path");
var fs = require("fs");
var loadBitTranspiler = require("../transpilers/load-transpiler");

var loadImpl = function (bitPath) {
  try {
    var implPath = path.join(bitPath, "impl.js");
    var implContent = require(implPath);
    return implContent;
  } catch (e) {
    throw e;
  }
};

var readRawImpl = function (bitPath) {
  try {
    var implPath = path.join(bitPath, "impl.js");
    var rawContents = fs.readFileSync(implPath, "utf8");
    return rawContents;
  } catch (e) {
    throw e;
  }
};

var getBitImpl = function (bitPath) {
  var transpiler = loadBitTranspiler(bitPath);
  if (!transpiler) {
    return loadImpl(bitPath);
  }

  var rawImpl = readRawImpl(bitPath);
  return eval(transpiler.transpile(rawImpl).code); //eslint-disable-line
};

module.exports = getBitImpl;
