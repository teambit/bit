/** @flow */

import path from 'path';
import format from 'string-format';
import { pathNormalizeToLinux } from '../../utils';
import { COMPONENT_DIR } from '../../constants';
import type { PathRelative } from '../../utils/path';

export default class ConfigDir {
  dirPath: PathRelative;

  constructor(dirPath: PathRelative) {
    this.dirPath = dirPath;
  }

  get linuxDirPath() {
    return pathNormalizeToLinux(this.dirPath);
  }

  get isUnderComponentDir() {
    return this.dirPath.startsWith(`{${COMPONENT_DIR}}`);
  }

  get hasEnvType() {
    return this.dirPath.includes('{ENV_TYPE}');
  }

  get isWorkspaceRoot() {
    const linDirPath = this.linuxDirPath;
    return linDirPath === '.' || linDirPath === './';
  }

  clone() {
    return new ConfigDir(this.dirPath);
  }

  replaceByComponentDirDSL(componentDir: string) {
    if (this.linuxDirPath.startsWith(componentDir)) {
      const replaced = this.linuxDirPath.replace(componentDir, `{${COMPONENT_DIR}}`);
      this.dirPath = path.normalize(replaced);
    }
  }

  getCleaned({ cleanComponentDir, cleanEnvType }: { cleanComponentDir: boolean, cleanEnvType: boolean }): ConfigDir {
    const componentDir = cleanComponentDir ? '' : `{${COMPONENT_DIR}}`;
    const envType = cleanEnvType ? '' : '{ENV_TYPE}';
    const cleaned = format(this.dirPath, { [`{${COMPONENT_DIR}}`]: componentDir, ENV_TYPE: envType });
    return new ConfigDir(cleaned);
  }

  getEnvTypeCleaned() {
    return this.getCleaned({ cleanComponentDir: false, cleanEnvType: true });
  }

  getComponentDirCleaned() {
    return this.getCleaned({ cleanComponentDir: true, cleanEnvType: false });
  }

  getResolved({ componentDir, envType }: { componentDir?: ?string, envType?: ?string }): ConfigDir {
    const resolvedComponentDir = componentDir || `{${COMPONENT_DIR}}`;
    const resolvedEnvType = envType || '{ENV_TYPE}';
    const resolved = format(this.dirPath, { [COMPONENT_DIR]: resolvedComponentDir, ENV_TYPE: resolvedEnvType });
    return new ConfigDir(resolved);
  }
}
