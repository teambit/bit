import { parse, stringify, assign } from 'comment-json';
import * as path from 'path';
import fs from 'fs-extra';
import ScopesData from './e2e-scopes';
import { WORKSPACE_JSONC } from '../constants';

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
      [key]: val
    };
    const updated = assign(bitJsonc, obj);
    this.write(updated, bitJsoncDir);
  }

  addToVariant(bitJsoncDir: string = this.scopes.localPath, variant: string, key: string, val: any) {
    const bitJsonc = this.read(bitJsoncDir);
    const variants = bitJsonc['@teambit/variants'];
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
    const variants = bitJsonc['@teambit/variants'];
    const newVariant = config;
    assign(variants, { [variant]: newVariant });
    this.addKeyVal(bitJsoncDir, '@teambit/variants', variants);
  }

  addKeyValToWorkspace(key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const bitJsonc = this.read(bitJsoncDir);
    const workspace = bitJsonc['@teambit/workspace'];
    assign(workspace, { [key]: val });
    this.addKeyVal(bitJsoncDir, '@teambit/workspace', workspace);
  }

  addDefaultScope(scope = this.scopes.remote) {
    this.addKeyValToWorkspace('defaultScope', scope);
  }

  addDefaultOwner(owner: string) {
    this.addKeyValToWorkspace('defaultOwner', owner);
  }
}

function composePath(dir: string): string {
  return path.join(dir, WORKSPACE_JSONC);
}
