"use strict";

var path = require("path");
var pathHasRepo = require("./repo-utils").pathHasRepo;

var locateRepo = function (absPath) {
  var buildPropogationPaths = function () {
    var paths = [];
    var pathParts = absPath.split(path.sep);

    pathParts.forEach(function (val, index) {
      var part = pathParts.slice(0, index).join("/");
      if (!part) { return; }
      paths.push(part);
    });

    return paths.reverse();
  };

  if (pathHasRepo(absPath)) { return absPath;}
  var searchPaths = buildPropogationPaths();
  return searchPaths.find(function (searchPath) { return pathHasRepo(searchPath); });
};

module.exports = locateRepo;
