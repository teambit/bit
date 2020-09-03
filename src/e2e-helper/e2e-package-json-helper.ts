import fs from 'fs-extra';
import * as path from 'path';

import ScopesData from './e2e-scopes';

export default class PackageJsonHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }
  read(packageJsonFolder: string = this.scopes.localPath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.readJSONSync(packageJsonPath) || {};
  }
  write(packageJson: Record<string, any>, packageJsonFolder: string = this.scopes.localPath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
  }
  create(data: Record<string, any>, location: string = this.scopes.localPath) {
    const packageJsonPath = path.join(location, 'package.json');
    fs.writeJSONSync(packageJsonPath, data, { spaces: 2 });
  }
  corrupt(packageJsonPath: string = path.join(this.scopes.localPath, 'package.json')) {
    fs.writeFileSync(packageJsonPath, '{ corrupted');
  }
  addKeyValue(data: Record<string, any>, pkgJsonPath: string = path.join(this.scopes.localPath)) {
    const pkgJson = this.read(pkgJsonPath);
    fs.writeJSONSync(path.join(pkgJsonPath, 'package.json'), Object.assign(pkgJson, data), { spaces: 2 });
  }
  readComponentPackageJson(id: string) {
    const packageJsonFolderPath = path.join(this.scopes.localPath, 'components', id);
    return this.read(packageJsonFolderPath);
  }
}
