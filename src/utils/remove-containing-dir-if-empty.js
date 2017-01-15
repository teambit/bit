// @flow
import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import R from 'ramda';

module.exports = function removeContainingDirIfEmpty(componentDir: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const containingDir = path.dirname(componentDir);

    return glob(path.join(containingDir, '*'), (err, matches) => {
      if (err) return reject(err);
      if (R.isEmpty(matches)) {
        return fs.remove(containingDir, (e) => {
          if (e) return reject(e);
          return resolve();
        });
      }

      return resolve();
    });
  });
};
