import { LinterAspect } from './linter.aspect';

export { LinterAspect };
export type { LinterMain, LinterConfig } from './linter.main.runtime';
export { LintResults, Linter, LintResult, ComponentLintResult } from './linter';
export type { LintTask } from './lint.task';
export type { LinterContext } from './linter-context';
export default LinterAspect;
