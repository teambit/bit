import { Compiler } from '@teambit/compiler';

export type IdeConfig = {
  tsconfig?: Object;
  globalTypesPaths: string[];
};

export interface TypescriptCompilerInterface extends Compiler {
  generateIdeConfig?: () => IdeConfig;
}
