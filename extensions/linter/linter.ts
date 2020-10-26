import { Component } from '@teambit/component';
import { LinterContext } from './linter-context';

export type ComponentLintResult = {
  /**
   * id of the linted component.
   */
  component: Component;

  /**
   * CLI output of the linter.
   */
  output: string;

  results: LintResults;
};

export type LintResult = {
  /**
   * path of the linted file.
   */
  filePath: string;

  /**
   * numbers of errors found.
   */
  errorCount: number;

  /**
   * number of found warnings.
   */
  warningCount: number;

  /**
   * lint messages.
   */
  messages: LintMessage[];
};

export type LintMessage = {
  /**
   * severity of the issue.
   */
  severity: string;
  /**
   * stating column of the issue.
   */
  column: number;

  /**
   * line of the issue.
   */
  line: number;

  /**
   * end column of the issue.
   */
  endColumn?: number;

  /**
   * end line of the issue.
   */
  endLine?: number;

  /**
   * message of the issue.
   */
  message: string;

  /**
   * lint suggestions.
   */
  suggestions?: string[];
};

export type LintResults = {
  results: ComponentLintResult[];
  errors: [];
};

export interface Linter {
  lint(context: LinterContext): Promise<LintResults>;
}
