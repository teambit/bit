const globlib = require('glob');
const path = require('path');

export default function glob(pattern: string, options?: {}): Promise<string[]> {
  return new Promise((resolve, reject) => {
    globlib(pattern, options, (err, matches) => {
      if (err) return reject(err);
      return resolve(matches.map((match) => path.normalize(match)));
    });
  });
}
