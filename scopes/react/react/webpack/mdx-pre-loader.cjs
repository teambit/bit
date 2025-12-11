"use strict";

function t(r) {
  return r.replace(/:::(\w+) (.+)/, ":::$1[$2]")
}

function e(r) {
  return this.resourcePath.endsWith(".mdx") ? t(r) : r
}

module.exports = e;
