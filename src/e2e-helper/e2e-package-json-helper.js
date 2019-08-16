// @flow
import path from 'path';
import fs from 'fs-extra';
import ScopesData from './e2e-scopes';

export default class PackageJsonHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }

  corruptPackageJson(packageJsonPath: string = path.join(this.scopes.localScopePath, 'package.json')) {
    fs.writeFileSync(packageJsonPath, '{ corrupted');
  }

  createPackageJson(data: Object, location: string = this.scopes.localScopePath) {
    const packageJsonPath = path.join(location, 'package.json');
    fs.writeJSONSync(packageJsonPath, data, { spaces: 2 });
  }

  addKeyValueToPackageJson(data: Object, pkgJsonPath: string = path.join(this.scopes.localScopePath)) {
    const pkgJson = this.readPackageJson(pkgJsonPath);
    fs.writeJSONSync(path.join(pkgJsonPath, 'package.json'), Object.assign(pkgJson, data), { spaces: 2 });
  }
  readPackageJson(packageJsonFolder: string = this.scopes.localScopePath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.readJSONSync(packageJsonPath) || {};
  }
  writePackageJson(packageJson: Object, packageJsonFolder: string = this.scopes.localScopePath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
  }

  readComponentPackageJson(id: string) {
    const packageJsonFolderPath = path.join(this.scopes.localScopePath, 'components', id);
    return this.readPackageJson(packageJsonFolderPath);
  }
}
