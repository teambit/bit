import { Extension } from '../..';
import { BaseCompiler } from '../base-compiler';

// @Extension({
//   name: 'typescript',
//   dependencies: [BaseCompiler]
// })
export class TypeScript {
  constructor(
    private compiler: string
  ) {}

  compile() {
    return this.compiler;
  }

  static async provider([baseCompiler]: [BaseCompiler]) {
    return new TypeScript(baseCompiler.compile());
  }
}
