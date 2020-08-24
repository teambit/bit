import fs from 'fs-extra';
import * as path from 'path';

import ScopesData from './e2e-scopes';

export default class ScopeJsonHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }
  read(scopeJsonDir: string = composeScopePathForWorkspace(this.scopes.localPath)) {
    const scopeJsonPath = path.join(scopeJsonDir, 'scope.json');
    return fs.existsSync(scopeJsonPath) ? fs.readJSONSync(scopeJsonPath) : {};
  }
  write(scopeJson: Record<string, any>, scopeJsonDir: string = composeScopePathForWorkspace(this.scopes.localPath)) {
    const scopeJsonPath = path.join(scopeJsonDir, 'scope.json');
    return fs.writeJSONSync(scopeJsonPath, scopeJson, { spaces: 2 });
  }
  addKeyVal(key: string, val: any, scopeJsonDir: string = composeScopePathForWorkspace(this.scopes.localPath)) {
    const scopeJson = this.read(scopeJsonDir);
    scopeJson[key] = val;
    this.write(scopeJson, scopeJsonDir);
  }
}

function composeScopePathForWorkspace(workspacePath: string) {
  return path.join(workspacePath, '.bit');
}
