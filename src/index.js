"use strict";

var path = require("path");
var glob = require("glob");
var composeRepoPath = require("./repo/repo-utils").composeRepoPath;
var locateRepo = require("./repo/locate-repo");
var loadBit = require("./bit/load-bit");

var composeInlinePath = function (repoPath) {
  return path.join(repoPath, "inline");
};

var mapBits = function (root) {
  var inlinePath = composeInlinePath(composeRepoPath(root));
  return glob
    .sync(path.join(inlinePath, "*"))
    .map(loadBit)
    .reduce(function (previousValue, currentValue) {
      if (!currentValue.name) { return previousValue; }
      previousValue[currentValue.name] = currentValue.ref;
      return previousValue;
    }, {});
};

var loadBits = function () {
  var repo = locateRepo(process.cwd());
  if (!repo) { return {}; }
  var bits = mapBits(repo);
  return bits;
};

module.exports = loadBits();
