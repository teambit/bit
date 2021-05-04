import { assign, parse, stringify } from 'comment-json';
import fs from 'fs-extra';
import * as path from 'path';

import { WORKSPACE_JSONC } from '../constants';
import ScopesData from './e2e-scopes';

// TODO: improve this by combine into a base class shared between this and e2e-bit-json-helper
export default class BitJsoncHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }
  read(bitJsoncDir: string = this.scopes.localPath) {
    const bitJsoncPath = composePath(bitJsoncDir);
    if (fs.existsSync(bitJsoncPath)) {
      const content = fs.readFileSync(bitJsoncPath).toString();
      return parse(content);
    }
    return {};
  }
  write(bitJsonc: Record<string, any>, bitJsoncDir: string = this.scopes.localPath) {
    const bitJsoncPath = composePath(bitJsoncDir);
    const content = stringify(bitJsonc, null, 2);
    return fs.writeFileSync(bitJsoncPath, content);
  }
  addKeyVal(bitJsoncDir: string = this.scopes.localPath, key: string, val: any) {
    const bitJsonc = this.read(bitJsoncDir);
    // Using this to keep the comments
    const obj = {
      [key]: val,
    };
    const updated = assign(bitJsonc, obj);
    this.write(updated, bitJsoncDir);
  }

  addToVariant(variant: string, key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const bitJsonc = this.read(bitJsoncDir);
    const variants = bitJsonc['teambit.workspace/variants'];
    const newVariant = variants[variant] ?? {};
    assign(newVariant, { [key]: val });
    this.setVariant(bitJsoncDir, variant, newVariant);
  }

  /**
   * Replace the entire variant config with the provided config.
   * In case you only want to add new extension to variant you probably want to use addToVariant
   * @param bitJsoncDir
   * @param variant
   * @param config
   */
  setVariant(bitJsoncDir: string = this.scopes.localPath, variant: string, config: any) {
    const bitJsonc = this.read(bitJsoncDir);
    const variants = bitJsonc['teambit.workspace/variants'];
    const newVariant = config;
    assign(variants, { [variant]: newVariant });
    this.addKeyVal(bitJsoncDir, 'teambit.workspace/variants', variants);
  }

  addKeyValToWorkspace(key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const bitJsonc = this.read(bitJsoncDir);
    const workspace = bitJsonc['teambit.workspace/workspace'];
    assign(workspace, { [key]: val });
    this.addKeyVal(bitJsoncDir, 'teambit.workspace/workspace', workspace);
  }

  addKeyValToDependencyResolver(key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const bitJsonc = this.read(bitJsoncDir);
    const depResolver = bitJsonc['teambit.dependencies/dependency-resolver'];
    assign(depResolver, { [key]: val });
    this.addKeyVal(bitJsoncDir, 'teambit.dependencies/dependency-resolver', depResolver);
  }

  addDefaultScope(scope = this.scopes.remote) {
    this.addKeyValToWorkspace('defaultScope', scope);
  }

  setPackageManager(packageManager = 'teambit.dependencies/yarn') {
    this.addKeyValToDependencyResolver('packageManager', packageManager);
  }

  addDefaultOwner(owner: string) {
    this.addKeyValToWorkspace('defaultOwner', owner);
  }
  disablePreview() {
    this.addKeyVal(undefined, 'teambit.preview/preview', { disabled: true });
  }
  setupDefault() {
    this.disablePreview();
    this.addDefaultScope();
  }
}

function composePath(dir: string): string {
  return path.join(dir, WORKSPACE_JSONC);
}
