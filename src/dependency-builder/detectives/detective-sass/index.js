// forked and changed from https://github.com/dependents/node-detective-sass

import detectiveCssAndPreprocessors from '../detective-css-and-preprocessors';

/**
 * Extract the @import statements from a given sass file's content
 *
 * @param  {String} fileContent
 * @return {String[]}
 */
module.exports = function detective(fileContent) {
  const detectiveResult = detectiveCssAndPreprocessors(fileContent, 'sass');
  detective.ast = detectiveCssAndPreprocessors.ast;
  return detectiveResult;
};
