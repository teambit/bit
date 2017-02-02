/** @flow */
import serverlessIndex from './serverless-index';
import indexer from './indexer';
import type { Doc } from './indexer';

const boost = {
  box: 3,
  tokenizedBox: 2,
  name: 5,
  tokenizedName: 4,
  functionNames: 2,
  tokenizedFunctionNames: 2,
  minDescription: 1
};

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

function queryItem(field, queryStr): Object {
  return {
    AND: { [field]: queryStr.toLowerCase().split(' ') },
    BOOST: boost[field],
  };
}

function buildQuery(queryStr: string): Array<Object> {
  const tokenizedQuery = indexer.tokenizeStr(queryStr);
  const query = [];
  query.push(queryItem('box', queryStr));
  query.push(queryItem('tokenizedBox', queryStr));
  query.push(queryItem('name', queryStr));
  query.push(queryItem('tokenizedName', tokenizedQuery));
  query.push(queryItem('functionNames', queryStr));
  query.push(queryItem('tokenizedFunctionNames', tokenizedQuery));
  query.push(queryItem('minDescription', queryStr));
  return query;
}

/**
 * Sort by the length of the name
 * @param {Array<Doc>} results
 * @return {Array<Doc>}
 */
function sortSearchResults(results: Array<Doc>): Array<Doc> {
  return results.sort((a, b) => a.name.length - b.name.length);
}

/**
 * Search in a local index.
 * 
 * When a string is found in more than one field, and these fields don't have the same boost,
 * the search-engine picks the boost of one of them randomly.
 * For example, the search term "object" is in the 'name' and the 'description' fields. The
 * search-engine might use the boost for the 'name', which is 4. But it also might use the boost
 * for the 'description', which is 1.
 * To workaround this issue, the search results are sorted manually after receiving them from the search engine.
 * 
 * The sort algorithm is as follows: 
 * Results that have a match with the 'name' field, are the most relevant, and therefore are first.
 * Among them, the shorter the name the most relevant it is. 
 * Other results, that is, results with a match of fields such as 'description', will be last.
 * 
 * @param {string} queryStr
 * @param {string} path
 * @return {Promise}
 */
function search(queryStr: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const index = serverlessIndex.initializeIndex(path);
    const searchResultsName = [];
    const searchResultsOthers = [];
    const query = buildQuery(queryStr);
    return index.then((indexInstance) => {
      indexInstance.search({
        query,
      }).on('data', function (data) {
        if (data.document.name.toLowerCase().includes(queryStr)) searchResultsName.push(data.document);
        else searchResultsOthers.push(data.document);
      }).on('end', function () {
        const sortedResults = sortSearchResults(searchResultsName);
        const searchResults = sortedResults.concat(searchResultsOthers);
        const formattedResults = searchResults.map(formatSearchResult);
        return resolve(JSON.stringify(formattedResults));
      });
    });
  });
}

module.exports = {
  search,
};
