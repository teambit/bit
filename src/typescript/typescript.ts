import { Compiler } from '../compiler/compiler';

export type TypeScriptDeps = [Compiler];

export class TypeScript {
  static async provide(config: {}, [compiler]: TypeScriptDeps) {
    // compiler.
  }
}
