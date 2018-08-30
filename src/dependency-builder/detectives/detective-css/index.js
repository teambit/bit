import detectiveCssAndPreprocessors from '../detective-css-and-preprocessors';

/**
 * Extract the @import statements from a given css file's content
 *
 * @param  {String} fileContent
 * @return {String[]}
 */
module.exports = function detective(fileContent) {
  const detectiveResult = detectiveCssAndPreprocessors(fileContent, 'css');
  detective.ast = detectiveCssAndPreprocessors.ast;
  return detectiveResult;
};
