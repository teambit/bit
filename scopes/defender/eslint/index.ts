import { ESLintAspect } from './eslint.aspect';

export { ESLintAspect };
export type { EslintLinterInterface } from './eslint-linter-interface';
export type {
  ESLintMain,
  ESLintOptions,
  EslintConfigTransformContext,
  EslintConfigTransformer,
} from './eslint.main.runtime';
export default ESLintAspect;
