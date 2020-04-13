import { parse, stringify, assign } from 'comment-json';
import * as path from 'path';
import fs from 'fs-extra';
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
      [key]: val
    };
    const updated = assign(bitJsonc, obj);
    this.write(updated, bitJsoncDir);
  }

  addToVariant(bitJsoncDir: string = this.scopes.localPath, variant: string, key: string, val: any) {
    const bitJsonc = this.read(bitJsoncDir);
    const variants = bitJsonc.variants;
    const newVariant = variants[variant] ?? {};
    assign(newVariant, { [key]: val });
    // console.log('currentVariants', currentVariants)
    assign(variants, { [variant]: newVariant });

    this.addKeyVal(bitJsoncDir, 'variants', variants);
  }

  addKeyValToWorkspace(key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const bitJsonc = this.read(bitJsoncDir);
    bitJsonc.workspace[key] = val;
    this.write(bitJsonc, bitJsoncDir);
  }

  addDefaultScope(scope = this.scopes.remote) {
    this.addKeyValToWorkspace('defaultScope', scope);
  }
}

function composePath(dir: string): string {
  return path.join(dir, 'bit.jsonc');
}
