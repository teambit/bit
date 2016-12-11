"use strict";

var camelcase = require("camelcase");
var getbitImpl = require("./load-impl");

var getName = function (bitPath) {
  var parts = bitPath.split("/");
  return camelcase(parts[parts.length - 1]);
};

var loadBit = function (bitPath) {
  try {
    return {
      name: getName(bitPath),
      ref: getbitImpl(bitPath)
    };
  } catch (e) {
    console.error(e);
    return {};
  }
};

module.exports = loadBit;
