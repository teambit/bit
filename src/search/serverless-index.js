/** @flow */
import path from 'path';
import fs from 'fs-extra';
import searchIndex from 'search-index';

const indexName = 'search_index';
const logLevel = 'error';
let index: Promise<any>;

function getIndexPath(scopePath: string) {
  return path.join(scopePath, indexName);
}

function deleteDb(scopePath: string) {
  const indexPath = getIndexPath(scopePath);
  if (!scopePath || !indexPath) return;
  fs.removeSync(indexPath);
}

function initializeIndex(scopePath: string): Promise<any> {
  if (!index) { // static var to make sure the index is not instantiated twice
    const indexOptions = {
      indexPath: getIndexPath(scopePath),
      logLevel,
      stopwords: []
    };

    index = new Promise((resolve, reject) => {
      searchIndex(indexOptions, (err, si) => {
        if (err) reject(err);
        resolve(si);
      });
    });
  }

  return index;
}

module.exports = {
  deleteDb,
  getIndexPath,
  initializeIndex,
};
