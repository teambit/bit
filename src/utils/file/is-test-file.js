// @flow

export default function isTestFile(fileName: string) {
  // see unit tests for examples
  return new RegExp('^.*.(test|spec|specs|tests).(js|ts|tsx|jsx)$').test(fileName);
}
