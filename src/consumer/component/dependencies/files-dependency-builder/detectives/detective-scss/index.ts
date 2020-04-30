// forked and changed from https://github.com/dependents/node-detective-scss

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import detectiveCssAndPreprocessors from '../detective-css-and-preprocessors';

/**
 * Extract the @import statements from a given scss file's content
 *
 * @param  {String} fileContent
 * @return {String[]}
 */
function detective(fileContent) {
  const detectiveResult = detectiveCssAndPreprocessors(fileContent, 'scss');
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  detective.ast = detectiveCssAndPreprocessors.ast;
  return detectiveResult;
}

export default detective;
