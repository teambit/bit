/**
 * Creates a string with the same length as `numSpaces` parameter
 * */
function indent(numSpaces) {
  return new Array(numSpaces + 1).join(' ');
}

/**
 * Gets the string length of the longer index in a hash
 * */
function getMaxIndexLength(input) {
  let maxWidth = 0;

  Object.getOwnPropertyNames(input).forEach(function (key) {
    // Skip undefined values.
    if (input[key] === undefined) {
      return;
    }

    maxWidth = Math.max(maxWidth, key.length);
  });
  return maxWidth;
}

export default { indent, getMaxIndexLength };
