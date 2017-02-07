const loadBitInline = require('./load-bit-inline');
const loadBitAssumingOneScopeOneVersion = require('./load-bit-assuming-one-scope-one-version');
const loadBitUsingBitJsons = require('./load-bit-using-bit-jsons');
const loadLatestBitAssumingOneScope = require('./load-latest-bit-assuming-one-scope');
const loadBitMultipleScopes = require('./load-bit-multiple-scopes');

module.exports = {
  loadBitInline,
  loadBitAssumingOneScopeOneVersion,
  loadBitUsingBitJsons,
  loadLatestBitAssumingOneScope,
  loadBitMultipleScopes,
};
