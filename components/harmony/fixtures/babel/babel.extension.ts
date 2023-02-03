import { Extension, provider } from '../..';
import { BaseCompiler } from '../base-compiler';

class Mock {

}

// @Extension({
  // dependencies: [BaseCompiler]
// })
export class Babel {
  constructor(
    private mock?: Mock
  ) {}

  // @provider()
  async provide([baseCompiler]: [BaseCompiler]) {
    return new Babel();
  }
}
