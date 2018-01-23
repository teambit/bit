/** @flow */
const globby = require('globby');
const path = require('path');

export default function glob(pattern: string, options: {}): Promise<string[]> {
  return globby(pattern, options).then(matches => matches.map(match => path.normalize(match)));
}
