import { Linter } from '@teambit/linter';

export type IdeConfig = {
  eslintConfig: Object;
  tsconfig?: Object;
};

export interface EslintLinterInterface extends Linter {
  generateIdeConfig?: () => IdeConfig;
}
