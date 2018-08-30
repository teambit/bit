// forked and changed from https://github.com/dependents/node-detective-scss

import detectiveCssAndPreprocessors from '../detective-css-and-preprocessors';

/**
 * Extract the @import statements from a given scss file's content
 *
 * @param  {String} fileContent
 * @return {String[]}
 */
module.exports = function detective(fileContent) {
  const detectiveResult = detectiveCssAndPreprocessors(fileContent, 'scss');
  detective.ast = detectiveCssAndPreprocessors.ast;
  return detectiveResult;
};
