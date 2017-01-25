/** @flow */
import path from 'path';
import searchIndex from 'search-index';
import { loadConsumer } from '../consumer';
const fs = require('fs-extra');

const indexName = 'search_index';
const logLevel = 'error';

function getIndexPath(scopePath: string) {
  return path.join(scopePath, indexName);
}

function deleteDb(scopePath: string) {
  const indexPath = getIndexPath(scopePath);
  if (!scopePath || !indexPath) return;
  fs.removeSync(indexPath);
}

function initializeIndex(scopePath: string): Promise<any> {
  const indexOptions = {
    indexPath: getIndexPath(scopePath),
    logLevel
  };

  if (!initializeIndex.index) { // static var to make sure the index is not instantiated twice
    initializeIndex.index = new Promise((resolve, reject) => {
      searchIndex(indexOptions, (err, si) => {
        if (err) reject(err);
        resolve(si);
      });
    });
  }

  return initializeIndex.index;
}

module.exports = {
  deleteDb,
  getIndexPath,
  initializeIndex,
};
