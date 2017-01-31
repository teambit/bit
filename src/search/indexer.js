/** @flow */
import path from 'path';
import { Readable } from 'stream';
import Component from '../consumer/component';
import serverlessIndex from './serverless-index';

export type Doc = {
  id: string,
  name: string,
  tokenizedName: string,
  box: string,
  tokenizedBox: string,
  functionNames: string,
  tokenizedFunctionNames: string,
  description: string,
  minDescription: string
};

let localIndex;

function tokenizeStr(str: string): string {
  return str.trim().split(/(?=[A-Z])/).join(' ').toLowerCase().split(/ |_|-/).join(' ');
}

/**
 * returns the first sentence of the description. 
 * @param {string} desc
 * @return {string}
 */
function minimizeDescription(desc: string = ''): string {
  return desc.split(/\.|;/)[0]; // split by a dot or a semicolon
}

function prepareDoc(docs: Object, component: Component): Doc {
  const name = component.name;
  const box = component.box;
  const functionNames = docs.map(doc => doc.name).join(' ');
  return {
    id: `${box}_${name}`,
    name,
    box,
    tokenizedNameExtra: tokenizeStr(name), // TODO: remove it when possible
    tokenizedName: tokenizeStr(name),
    tokenizedBox: tokenizeStr(box),
    functionNames,
    tokenizedFunctionNames: tokenizeStr(functionNames),
    description: docs.map(doc => doc.description).join(' '),
    minDescription: docs.map(doc => minimizeDescription(doc.description)).join(' ')
  };
}

function addToLocalIndex(component: Component): Promise<string> {
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

function index(component: Component, scopePath: string): Promise<string> {
  localIndex = serverlessIndex.initializeIndex(scopePath);
  return addToLocalIndex(component);
}

function indexAll(path: string, components: Component[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!components) return reject('The scope is empty');
    serverlessIndex.deleteDb(path);
    localIndex = serverlessIndex.initializeIndex(path);
    const results = components.map(component => addToLocalIndex(component));
    return resolve(Promise.all(results));
  });
}

module.exports = {
  index,
  indexAll,
  tokenizeStr
};
