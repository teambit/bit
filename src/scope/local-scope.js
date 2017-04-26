// @flow
import path from 'path';
import { BIT_HIDDEN_DIR } from '../constants';
import { readFileP } from '../utils';

export default class LocalScope {
  scopeJson: Object;

  constructor(scopeJson: Object) {
    this.scopeJson = scopeJson;
  }

  getScopeName(): string {
    return this.scopeJson.name;
  }

  static load(projectRoot: string): Promise<LocalScope> {
    const loadScopeJson = (): Promise<Object> => {
      const scopeJsonPath = path.join(projectRoot, BIT_HIDDEN_DIR, 'scope.json');
      return readFileP(scopeJsonPath).then(data => JSON.parse(data));
    };

    return new Promise((resolve, reject) => {
      loadScopeJson(projectRoot)
        .then(scopeJson => resolve(new LocalScope(scopeJson)))
        .catch(err => reject(err));
    });
  }
}
