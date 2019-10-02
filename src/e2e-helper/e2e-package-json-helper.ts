// @flow
import path from 'path';
import fs from 'fs-extra';
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
  write(packageJson: Object, packageJsonFolder: string = this.scopes.localPath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
  }
  create(data: Object, location: string = this.scopes.localPath) {
    const packageJsonPath = path.join(location, 'package.json');
    fs.writeJSONSync(packageJsonPath, data, { spaces: 2 });
  }
  corrupt(packageJsonPath: string = path.join(this.scopes.localPath, 'package.json')) {
    fs.writeFileSync(packageJsonPath, '{ corrupted');
  }
  addKeyValue(data: Object, pkgJsonPath: string = path.join(this.scopes.localPath)) {
    const pkgJson = this.read(pkgJsonPath);
    fs.writeJSONSync(path.join(pkgJsonPath, 'package.json'), Object.assign(pkgJson, data), { spaces: 2 });
  }
  readComponentPackageJson(id: string) {
    const packageJsonFolderPath = path.join(this.scopes.localPath, 'components', id);
    return this.read(packageJsonFolderPath);
  }
}
