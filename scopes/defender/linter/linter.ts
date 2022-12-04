import { BuildContext } from '@teambit/builder';
import { Component } from '@teambit/component';
import { LinterContext } from './linter-context';

export type ComponentLintResult = {
  /**
   * the linted component.
   */
  component: Component;

  /**
   * CLI output of the linter.
   */
  output: string;

  /**
   * total errors count of the component (from all of the files).
   */
  totalErrorCount: number;
  /**
   * total fatal errors count of the component (from all of the files).
   */
  totalFatalErrorCount?: number;
  /**
   * total fixable errors count of the component (from all of the files).
   */
  totalFixableErrorCount?: number;
  /**
   * total fatal warning count of the component (from all of the files).
   */
  totalFixableWarningCount?: number;
  /**
   * total warning count of the component (from all of the files).
   */
  totalWarningCount: number;

  /**
   * lint results for each one of the component files
   */
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
  /**
   * total errors count of the component (from all of the components).
   */
  totalErrorCount: number;
  /**
   * total fatal errors count of the component (from all of the components).
   */
  totalFatalErrorCount?: number;
  /**
   * total fixable errors count of the component (from all of the components).
   */
  totalFixableErrorCount?: number;
  /**
   * total fatal warning count of the component (from all of the components).
   */
  totalFixableWarningCount?: number;
  /**
   * total warning count of the component (from all of the components).
   */
  totalWarningCount: number;

  totalComponentsWithErrorCount: number;
  totalComponentsWithFatalErrorCount?: number;
  totalComponentsWithFixableErrorCount?: number;
  totalComponentsWithFixableWarningCount?: number;
  totalComponentsWithWarningCount: number;

  errors: Error[];
};

export interface Linter {
  lint(context: LinterContext, buildContext?: BuildContext): Promise<LintResults>;
}
