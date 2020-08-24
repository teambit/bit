// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import { Doc } from './indexer';
// import buildQuery from './query-builder';
// import serverlessIndex from './serverless-index';

// const numOfResultsPerPage = 15;

// function totalHits(index: Promise<any>, query: string) {
//   return new Promise((resolve, reject) => {
//     return index.then((indexInstance) => {
//       indexInstance.totalHits({
//         query: buildQuery(query)
//       }, (err, count) => {
//         if (err) reject(err);
//         resolve(JSON.stringify(count));
//       });
//     });
//   });
// }

// function countDocs(index: Promise<any>) {
//   return new Promise((resolve, reject) => {
//     return index.then((indexInstance) => {
//       indexInstance.countDocs((err, info) => {
//         if (err) reject(err);
//         resolve(info);
//       });
//     });
//   });
// }

// function getDoc(index: Promise<any>, docIds: string[]) {
//   return new Promise((resolve, reject) => {
//     return index.then((indexInstance) => {
//       indexInstance.get(docIds).on('data', function (doc) {
//         // console.log(doc);
//       });
//     });
//   });
// }

/**
 * Sort by the score. If the score is equal, sort by the length of the name.
 * @param {Array<any>} results
 * @return {Array<any>}
 */
// function sortSearchResults(results: Array<any>): Array<any> {
//   return results.sort((a, b) => {
//     if (a.score !== b.score) return a.score - b.score;
//     return a.document.name.length - b.document.name.length;
//   });
// }

function formatter(doc: Doc | any): string {
  if (doc.owner && typeof doc.owner === 'string' && typeof doc.scope === 'string') {
    // from web search
    return `> ${doc.owner}.${doc.scope}/${doc.name}`;
  }
  return `> ${doc.name}`;
}

/**
 * Search in a local LevelUp index.
 *
 * @param {string} queryStr
 * @param {string} path
 * @return {Promise}
 */
// function search(queryStr: string, path: string): Promise<Doc[]> {
//   return new Promise((resolve) => {
//     const index = serverlessIndex.initializeIndex(path);
//     const searchResults = [];
//     const query = buildQuery(queryStr);
//     return index.then((indexInstance) => {
//       indexInstance
//         .search({
//           query,
//           pageSize: numOfResultsPerPage,
//         })
//         .on('data', function (data) {
//           // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
//           searchResults.push(data);
//         })
//         .on('end', function () {
//           const searchResultsSorted = sortSearchResults(searchResults);
//           return resolve(searchResultsSorted.map((result) => result.document));
//         });
//     });
//   });
// }

module.exports = {
  // search,
  formatter,
};
