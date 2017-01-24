/** @flow */
import serverlessIndex from './serverless-index';
import indexer from './indexer';
import { loadConsumer } from '../consumer';

let localIndex;

function totalHits(query: string) {
  return new Promise((resolve, reject) => {
    return localIndex.then((indexInstance) => {
      indexInstance.totalHits({
        query: buildQuery(query)
      }, (err, count) => {
        if (err) reject(err);
        resolve(JSON.stringify(count));
      });
    });
  });
}

function countDocs() {
  return new Promise((resolve, reject) => {
    return localIndex.then((indexInstance) => {
      indexInstance.countDocs((err, info) => {
        if (err) reject(err);
        resolve(info);
      });
    });
  });
}

function getDoc(docIds: string[]) {
  return new Promise((resolve, reject) => {
    return localIndex.then((indexInstance) => {
      indexInstance.get(docIds).on('data', function (doc) {
        console.log(doc);
      });
    });
  });
}

function formatSearchResult(searchResult: Object): string {
  const doc = searchResult.document;
  return `> ${doc.box}/${doc.name}`;
}

function queryItem(field, query, boost = 1) {
  return {
    AND: { [field]: query.toLowerCase().split(' ') },
    BOOST: boost
  };
}

function buildQuery(queryStr: string) {
  const tokenizedQuery = indexer.tokenizeStr(queryStr);
  const query = [];
  query.push(queryItem('box', queryStr, 4));
  query.push(queryItem('tokenizedBox', queryStr, 3));
  query.push(queryItem('name', queryStr, 4));
  query.push(queryItem('tokenizedName', tokenizedQuery, 3));
  query.push(queryItem('functionNames', queryStr, 3));
  query.push(queryItem('tokenizedFunctionNames', tokenizedQuery, 2));
  query.push(queryItem('description', queryStr));
  return query;
}

function search(queryStr: string, scope: string = '', reindex: boolean = false) {
  return new Promise((resolve, reject) => {
    const promise = reindex ? indexer.indexAll(scope) : Promise.resolve();
    promise.then(() => {
      return loadConsumer()
        .then(consumer => {
          localIndex = serverlessIndex.initializeIndex(consumer.scope.path);
          const searchResults = [];
          const query = buildQuery(queryStr);
          return localIndex.then((indexInstance) => {
            indexInstance.search({
              query,
            }).on('data', function (data) {
              searchResults.push(formatSearchResult(data));
            })
              .on('end', function () {
                return resolve(JSON.stringify(searchResults));
              });
          });
        });
    });
  });
}

module.exports = {
  search,
};
