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

  totalErrorCount: number;
  totalFatalErrorCount?: number;
  totalFixableErrorCount?: number;
  totalFixableWarningCount?: number;
  totalWarningCount: number;

  results: LintResult[];
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
   * numbers of errors found.
   */
  fatalErrorCount?: number;

  /**
   * numbers of fixable errors found.
   */
  fixableErrorCount?: number;

  /**
   * numbers of fixable warning found.
   */
  fixableWarningCount?: number;

  /**
   * number of found warnings.
   */
  warningCount: number;

  /**
   * lint messages.
   */
  messages: LintMessage[];

  /**
   * Raw data as returned from the linter
   */
  raw: any;
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
  totalErrorCount: number;
  totalFatalErrorCount?: number;
  totalFixableErrorCount?: number;
  totalFixableWarningCount?: number;
  totalWarningCount: number;
  errors: Error[];
};

export interface Linter {
  lint(context: LinterContext): Promise<LintResults>;
}
