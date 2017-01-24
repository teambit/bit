/** @flow */
import path from 'path';
import searchIndex from 'search-index';
import { loadConsumer } from '../consumer';

const indexName = 'search_index';
const logLevel = 'error';

function getIndexPath(scopePath: string) {
  return path.join(scopePath, indexName);
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
  initializeIndex,
};
