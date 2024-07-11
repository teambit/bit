import fs from 'fs-extra';
import * as path from 'path';
import { pickBy } from 'lodash';
import R from 'ramda';
import { BitIds } from '@teambit/legacy-bit-id';
import { DEFAULT_EXTENSIONS, DEFAULT_LANGUAGE, PACKAGE_JSON } from '../../constants';
import { PathLinux, PathOsBased } from '@teambit/legacy.utils';
import { ExtensionDataList } from './extension-data';

export type EnvFile = {
  [key: string]: PathLinux;
};

export type AbstractConfigProps = {
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  lang?: string;
  extensions?: ExtensionDataList;
};

/**
 * There are two Bit Config: WorkspaceConfig and ComponentConfig, both inherit this class.
 * The config data can be written in package.json inside "bit" property. And, can be written in
 * bit.json file. Also, it might be written in both, in which case, if there is any conflict, the
 * bit.json wins.
 */
export default class AbstractConfig {
  path: string;
  dependencies: { [key: string]: string };
  devDependencies: { [key: string]: string };
  lang: string;
  extensions: ExtensionDataList;

  constructor(props: AbstractConfigProps) {
    this.lang = props.lang || DEFAULT_LANGUAGE;
    this.extensions = props.extensions || new ExtensionDataList();
  }

  getDependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  toPlainObject(): Record<string, any> {
    const isPropDefaultOrNull = (val, key) => {
      if (!val) return false;
      if (key === 'lang') return val !== DEFAULT_LANGUAGE;
      if (key === 'extensions') return !R.equals(val, DEFAULT_EXTENSIONS);
      return true;
    };

    return pickBy(
      {
        lang: this.lang,
        dependencies: this.dependencies,
        extensions: this.extensions?.toConfigObject(),
      },
      isPropDefaultOrNull
    );
  }
  static composePackageJsonPath(bitPath: PathOsBased): PathOsBased {
    return path.join(bitPath, PACKAGE_JSON);
  }
  static async pathHasPackageJson(bitPath: string): Promise<boolean> {
    return fs.pathExists(this.composePackageJsonPath(bitPath));
  }

  static async loadJsonFileIfExist(jsonFilePath: string): Promise<Record<string, any> | null | undefined> {
    try {
      const file = await fs.readJson(jsonFilePath);
      return file;
    } catch (e: any) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
}
