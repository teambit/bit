// @flow
import glob from 'glob';
import path from 'path';
import BitJson from 'bit-scope-client/bit-json';
import {
  VERSION_DELIMITER,
  ID_DELIMITER,
  DEFAULT_DIST_DIRNAME,
  NO_PLUGIN_TYPE,
} from '../constants';
import LocalScope from '../scope/local-scope';

export const generateId = ({ scope, namespace, name, version }: { scope: string, namespace: string,
  name: string, version: string }) =>
  scope + ID_DELIMITER + namespace + ID_DELIMITER + name + VERSION_DELIMITER + version;

// function getRequiredFileDEPRECATED(bitJson: BitJson): string {
//   return !bitJson.compiler || bitJson.compiler !== NO_PLUGIN_TYPE ?
//     path.join(DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME) : bitJson.impl;
// }

function getRequiredFile(bitJson: BitJson): string {
  return !bitJson.compiler || bitJson.compiler !== NO_PLUGIN_TYPE ?
    path.join(DEFAULT_DIST_DIRNAME, bitJson.impl) : bitJson.impl;
}

function getLocalScopeNameP(projectRoot: string): Promise<?string> {
  return new Promise(resolve => LocalScope.load(projectRoot)
    .then(localScopeName => resolve(localScopeName.getScopeName()))
    .catch(() => resolve(null)));
}

export function buildForInline(targetComponentsDir: string, bitJson: BitJson): Promise<Object> {
  return new Promise((resolve, reject) => {
    const componentsMap = {};
    glob('*/*', { cwd: targetComponentsDir }, (err, files) => {
      if (err) return reject(err);
      files.forEach((loc) => {
        const file = getRequiredFile(bitJson);
        const compiler = bitJson.compiler;
        componentsMap[loc] = { loc, file, compiler };
      });

      return resolve(componentsMap);
    });
  });
}

export function buildForNamespaces(targetModuleDir: string): Promise<Object> {
  return new Promise((resolve, reject) => {
    const namespaceMap = {};
    glob('*/*', { cwd: targetModuleDir }, (err, dirs) => {
      if (err) return reject(err);
      dirs.forEach((dir) => {
        const [namespace, name] = dir.split(path.sep);
        if (namespaceMap[namespace]) namespaceMap[namespace].push(name);
        else namespaceMap[namespace] = [name];
      });
      return resolve(namespaceMap);
    });
  });
}

export function build(projectRoot: string, targetComponentsDir: string): Promise<Object> {
  return new Promise((resolve, reject) => {
    const componentsMap = {};
    getLocalScopeNameP(projectRoot).then((localScopeName) => {
      glob('*/*/*/*', { cwd: targetComponentsDir }, (err, files) => {
        if (err) return reject(err);
        files.forEach((loc) => {
          const [namespace, name, scope, version] = loc.split(path.sep);
          const id = generateId({ scope, namespace, name, version });
          const bitJson = BitJson.load(path.join(targetComponentsDir, loc));
          const dependencies = [];
          Object.keys(bitJson.dependencies).forEach((dependency) => {
            dependencies.push(dependency + VERSION_DELIMITER + bitJson.dependencies[dependency]);
          });
          const file = getRequiredFile(bitJson);
          const isFromLocalScope = localScopeName ? localScopeName === scope : false;

          componentsMap[id] = { loc, file, dependencies, isFromLocalScope };
        });
        return resolve(componentsMap);
      });
    });
  });
}
