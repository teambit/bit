// import serverlessIndex from './serverless-index';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import indexer from './indexer';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import { search } from './searcher';
import { loadConsumer } from '../consumer';
import { loadScope } from '../scope';
import { getScopeRemotes } from '../scope/scope-remotes';

async function searchLocally(queryStr: string, reindex: boolean = false): Promise<any> {
  let scopePath;
  if (reindex) {
    return loadConsumer()
      .then((consumer) => {
        scopePath = consumer.scope.path;
        return consumer.scope.listLocal();
      })
      .then((components) => {
        return indexer.indexAll(scopePath, components);
      })
      .then(() => search(queryStr, scopePath));
    // .catch(Promise.reject);
  }
  return loadConsumer().then((consumer) => {
    scopePath = consumer.scope.path;
    return search(queryStr, scopePath);
  });
}

async function searchRemotely(queryStr: string, scope: string, reindex: boolean = false): Promise<any> {
  return loadConsumer().then((consumer) => {
    return getScopeRemotes(consumer.scope).then((remotes) =>
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      remotes.resolve(scope, consumer.scope.name).then((remote) => {
        return remote.search(queryStr, reindex);
      })
    );
  });
  // .catch(Promise.reject);
}

async function scopeSearch(path: string, query: string, reindex: boolean): Promise<any> {
  if (reindex) {
    return loadScope(path)
      .then((scope) => {
        return scope.listLocal();
      })
      .then((components) => {
        return indexer.indexAll(path, components);
      })
      .then(() => search(query, path));
    // .catch(Promise.reject);
  }
  return search(query, path);
}

module.exports = {
  searchLocally,
  searchRemotely,
  scopeSearch,
};
