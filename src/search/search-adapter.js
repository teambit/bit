/** @flow */
import serverlessIndex from './serverless-index';
import indexer from './indexer';
import searcher from './searcher';
import { loadConsumer } from '../consumer';
import { loadScope } from '../scope';

function searchLocally(queryStr: string, reindex: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    let scopePath;
    if (reindex) {
      loadConsumer()
        .then(consumer => {
          scopePath = consumer.scope.path;
          return consumer.scope.listStage();
        })
        .then((components) => {
          return indexer.indexAll(scopePath, components);
        })
        .then(() => {
          resolve(searcher.search(queryStr, scopePath));
        });
    }
    else {
      loadConsumer()
        .then(consumer => {
          scopePath = consumer.scope.path;
          resolve(searcher.search(queryStr, scopePath));
        });
    }
  });
}

function searchRemotely(queryStr: string, scope: string, reindex: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    loadConsumer()
      .then(consumer => {
        return consumer.scope.remotes()
          .then(remotes =>
            // $FlowFixMe
            remotes.resolve(scope, consumer.scope.name)
              .then(remote => {
                resolve(remote.search(queryStr, reindex));
              })
          );
      });
  });
}

function scopeSearch(path: string, query: string, reindex: boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    if (reindex) {
      loadScope(path)
        .then(scope => {
          return scope.listStage();
        })
        .then((components) => {
          return indexer.indexAll(path, components);
        })
        .then(() => {
          resolve(searcher.search(query, path));
        });
    }
    else {
      resolve(searcher.search(query, path));
    }
  });
}

module.exports = {
  searchLocally,
  searchRemotely,
  scopeSearch,
};
