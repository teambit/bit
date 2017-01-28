/** @flow */
import serverlessIndex from './serverless-index';
import indexer from './indexer';
import type Doc from './indexer';

function totalHits(index: Promise<any>, query: string) {
  return new Promise((resolve, reject) => {
    return index.then((indexInstance) => {
      indexInstance.totalHits({
        query: buildQuery(query)
      }, (err, count) => {
        if (err) reject(err);
        resolve(JSON.stringify(count));
      });
    });
  });
}

function countDocs(index: Promise<any>) {
  return new Promise((resolve, reject) => {
    return index.then((indexInstance) => {
      indexInstance.countDocs((err, info) => {
        if (err) reject(err);
        resolve(info);
      });
    });
  });
}

function getDoc(index: Promise<any>, docIds: string[]) {
  return new Promise((resolve, reject) => {
    return index.then((indexInstance) => {
      indexInstance.get(docIds).on('data', function (doc) {
        console.log(doc);
      });
    });
  });
}

function formatSearchResult(doc: Doc): string {
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

function search(queryStr: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const index = serverlessIndex.initializeIndex(path);
    const searchResults = [];
    const query = buildQuery(queryStr);
    return index.then((indexInstance) => {
      indexInstance.search({
        query,
      }).on('data', function (data) {
        searchResults.push(formatSearchResult(data.document));
      }).on('end', function () {
          return resolve(JSON.stringify(searchResults));
        });
    });
  });
}

module.exports = {
  search,
};
