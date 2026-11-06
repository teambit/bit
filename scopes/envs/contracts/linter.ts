import type { BuildContext } from './build';
import type { Component } from './component';
import type { ComponentMap } from './component-map';
import type { ExecutionContext } from './execution-context';

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
   * whether the component is clean (have no issues at all)
   */
  isClean: boolean;

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
  totalErrorCount?: number;
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
  totalWarningCount?: number;

  totalComponentsWithErrorCount?: number;
  totalComponentsWithFatalErrorCount?: number;
  totalComponentsWithFixableErrorCount?: number;
  totalComponentsWithFixableWarningCount?: number;
  totalComponentsWithWarningCount?: number;

  /**
   * whether all the linted components is clean (have no issues at all)
   */
  isClean?: boolean;

  errors: Error[];
};

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
export type EslintFixType = 'problem' | 'suggestion' | 'layout';
export type OxlintFixType = 'all' | 'suggestions' | 'dangerously';
export type FixType = EslintFixType | OxlintFixType | string;
export type FixTypes = Array<FixType>;

export interface LinterOptions {
  /**
   * extensions formats to lint. (e.g. .ts, .tsx, etc.)
   */
  extensionFormats?: string[];

  /**
   * automatically fix problems
   */
  fix?: boolean;

  /**
   * specify the types of fixes to apply (problem, suggestion, layout)
   */
  fixTypes?: FixTypes;
}
export interface LinterContext extends ExecutionContext, LinterOptions {
  quiet?: boolean;
  /**
   * Root dir that contains all the components in the fs that are about to be linted
   * Usually it's the workspace root dir or the capsule root dir
   */
  rootDir?: string;

  /**
   * Component map with the path to the component in the fs
   */
  componentsDirMap: ComponentMap<string>;
}
