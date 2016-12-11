"use strict";

var fs = require("fs");
var path = require("path");
var constants = require("../constants");

var BIT_DIR_NAME = constants.BIT_DIR_NAME;

var composeRepoPath = function (p) {
  return path.join(p, BIT_DIR_NAME);
};

var pathHasRepo = function (p) {
  return fs.existsSync(composeRepoPath(p));
};

module.exports = {
  pathHasRepo: pathHasRepo,
  composeRepoPath: composeRepoPath
};
