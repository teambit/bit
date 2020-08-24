import { assign, stringify } from 'comment-json';
import fs from 'fs-extra';
import * as path from 'path';

import { COMPONENT_CONFIG_FILE_NAME } from '../constants';
import ScopesData from './e2e-scopes';

// TODO: improve this by combine into a base class shared between this and e2e-bit-json-helper
export default class ComponentJsonHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }
  read(componentRelativeDir: string) {
    const componentJsonPath = this.composePath(componentRelativeDir);
    if (fs.existsSync(componentJsonPath)) {
      const content = fs.readJSONSync(componentJsonPath);
      return content;
    }
    return {};
  }
  deleteIfExist(componentRelativeDir = 'bar') {
    const componentJsonPath = this.composePath(componentRelativeDir);
    if (fs.existsSync(componentJsonPath)) {
      fs.unlinkSync(componentJsonPath);
    }
  }
  write(componentJson: Record<string, any>, componentRelativeDir = 'bar') {
    const componentJsonPath = this.composePath(componentRelativeDir);
    const content = stringify(componentJson, null, 2);
    return fs.writeFileSync(componentJsonPath, content);
  }
  addKeyVal(key: string, val: any, componentRelativeDir = 'bar') {
    const componentJson = this.read(componentRelativeDir);
    // Using this to keep the comments
    const obj = {
      [key]: val,
    };
    const updated = assign(componentJson, obj);
    this.write(updated, componentRelativeDir);
  }

  setExtension(extensionId: string, extensionConfig: any, componentRelativeDir = 'bar') {
    const componentJson = this.read(componentRelativeDir);
    const extensions = componentJson.extensions || {};
    extensions[extensionId] = extensionConfig;
    this.addKeyVal('extensions', extensions, componentRelativeDir);
  }

  removeExtension(extensionId: string, componentRelativeDir = 'bar') {
    const componentJson = this.read(componentRelativeDir);
    const extensions = componentJson.extensions || {};
    delete extensions[extensionId];
    this.addKeyVal('extensions', extensions, componentRelativeDir);
  }

  setPropagate(propagateVal: boolean, componentRelativeDir = 'bar') {
    this.addKeyVal('propagate', propagateVal, componentRelativeDir);
  }

  addDefaultScope(scope = this.scopes.remote) {
    this.addKeyVal('defaultScope', scope);
  }

  composePath(componentRelativeDir = 'bar'): string {
    return path.join(this.scopes.localPath, componentRelativeDir, COMPONENT_CONFIG_FILE_NAME);
  }

  // addDefaultOwner(owner: string) {
  //   this.addKeyValToWorkspace('defaultOwner', owner);
  // }
}
