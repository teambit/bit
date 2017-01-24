/** @flow */
import path from 'path';
import { Readable } from 'stream';
import { parser } from '../jsdoc';
import { loadConsumer } from '../consumer';
import Component from '../consumer/component';

import serverlessIndex from './serverless-index';

let localIndex;

function tokenizeStr(str: string) {
  return str.trim().split(/(?=[A-Z])/).join(' ').toLowerCase().split(/ |_|-/).join(' ');
}

function prepareDoc(docs: Object, component: Component): Object {
  const name = component.name;
  const box = component.box;
  const functionNames = docs.map(doc => doc.name).join(' ');
  return {
    id: `${box}_${name}`,
    name,
    tokenizedName: tokenizeStr(name),
    box,
    tokenizedBox: tokenizeStr(box),
    functionNames,
    tokenizedFunctionNames: tokenizeStr(functionNames),
    description: docs.map(doc => doc.description).join(' ')
  };
}

function addToLocalIndex(component: Component): Promise<any> {
  return new Promise((resolve, reject) => {
    const doc = prepareDoc(component.docs, component);
    localIndex.then((indexInstance) => {
      const docStream = new Readable({ objectMode: true });
      docStream.push(doc);
      docStream.push(null);
      docStream
        .pipe(indexInstance.defaultPipeline())
        .pipe(indexInstance.add())
        .on('data', (d) => {
          // this function needs to be called if you want to listen for the end event
        })
        .on('end', () => {
          resolve('The indexing has been completed');
        });
    });
  });
}

function index(component: Component, scopePath: string) {
  localIndex = serverlessIndex.initializeIndex(scopePath);
  return addToLocalIndex(component);
}

function indexAll(scope: string = ''): Promise<any> {
  return new Promise((resolve, reject) => {
    if (scope) {
      reject('not implemented yet'); // FIXME
    }
    else {
      return loadConsumer()
        .then(consumer => {
          localIndex = serverlessIndex.initializeIndex(consumer.scope.path);
          return consumer.scope.list(scope);
        })
        .then(components => {
          if (!components) return reject('The local scope is empty');
          const results = components.map(component => addToLocalIndex(component));
          return resolve(Promise.all(results));
        });
    }
  });
}

module.exports = {
  index,
  indexAll,
  tokenizeStr
};
