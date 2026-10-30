import type { BuildContext } from '@teambit/builder';
import type { LinterContext } from './linter-context';
import type { LintResults } from '@teambit/envs.contracts';

export type { ComponentLintResult, LintResult, LintMessage, LintResults } from '@teambit/envs.contracts';

export interface Linter {
  id: string;
  /**
   * serialized config of the linter.
   */
  displayConfig?(): string;

  /**
   * returns the version of the current linter instance (e.g. '4.0.1').
   */
  version?(): string | Promise<string>;

  /**
   * returns the display name of the current linter instance (e.g. 'ESlint')
   */
  displayName?: string;

  /**
   * lint the given component.
   */
  lint(context: LinterContext, buildContext?: BuildContext): Promise<LintResults>;
}
