import { BitError } from '@teambit/bit-error';

export class TsConfigNotFound extends BitError {
  constructor() {
    super(
      'tsconfig not found. You must provide either specify a path to a valid `tsconfig.json` or set `compilerOptions`'
    );
  }
}
