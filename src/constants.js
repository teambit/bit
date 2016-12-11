"use strict";

var userHome = require("user-home");
var path = require("path");

var getDirectory = function () {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "Bit");
  }

  return path.join(userHome, ".bit");
};

var getCacheDirectory = function () {
  if (process.platform === "darwin") {
    return path.join(userHome, "Library", "Caches", "Bit");
  }

  return getDirectory();
};

/**
 * cache root directory
 */
var CACHE_ROOT = getCacheDirectory();

/**
 * global transpilers directory
 */
var TRANSPILERS_DIR = path.join(CACHE_ROOT, "transpilers");

var BIT_DIR_NAME = "bits";

var LOCAL_BIT_JSON_NAME = ".bit.json";

module.exports = {
  TRANSPILERS_DIR: TRANSPILERS_DIR,
  BIT_DIR_NAME: BIT_DIR_NAME,
  LOCAL_BIT_JSON_NAME: LOCAL_BIT_JSON_NAME
};
