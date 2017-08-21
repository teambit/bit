/** @flow */
// import serverlessIndex from './serverless-index';
import indexer from './indexer';
import { search } from './searcher';
import { loadConsumer } from '../consumer';
import { loadScope } from '../scope';

function searchLocally(queryStr: string, reindex: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    let scopePath;
    if (reindex) {
      loadConsumer()
        .then((consumer) => {
          scopePath = consumer.scope.path;
          return consumer.scope.listStage();
        })
        .then((components) => {
          return indexer.indexAll(scopePath, components);
        })
        .then(() => {
          resolve(search(queryStr, scopePath));
        })
        .catch(reject);
    } else {
      loadConsumer()
        .then((consumer) => {
          scopePath = consumer.scope.path;
          resolve(search(queryStr, scopePath));
        });
    }
  });
}

function searchRemotely(queryStr: string, scope: string, reindex: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    loadConsumer()
      .then((consumer) => {
        return consumer.scope.remotes()
          .then(remotes =>
            remotes.resolve(scope, consumer.scope.name)
              .then((remote) => {
                resolve(remote.search(queryStr, reindex));
              })
          );
      }).catch(reject);
  });
}

function scopeSearch(path: string, query: string, reindex: boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    if (reindex) {
      loadScope(path)
        .then((scope) => {
          return scope.listStage();
        })
        .then((components) => {
          return indexer.indexAll(path, components);
        })
        .then(() => {
          resolve(search(query, path));
        })
        .catch(reject);
    } else {
      resolve(search(query, path));
    }
  });
}

module.exports = {
  searchLocally,
  searchRemotely,
  scopeSearch,
};
