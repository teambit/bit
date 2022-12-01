import { LinterAspect } from './linter.aspect';

export { LinterAspect };
export type { LinterMain, LinterConfig } from './linter.main.runtime';
export { LintResults, Linter, LintResult, ComponentLintResult } from './linter';
export type { LintTask } from './lint.task';
export type { LinterContext, LinterOptions } from './linter-context';
export type { LinterEnv } from './linter-env-type';
export default LinterAspect;
