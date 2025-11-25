import type { Component } from '@teambit/component';
import type { FormatterContext } from './formatter-context';

export type ComponentFormatResult = {
  /**
   * the formatted component.
   */
  component: Component;

  /**
   * format results for each file of the component.
   */
  results: FileFormatResult[];
};

export type FileFormatResult = {
  /**
   * path of the formatted file.
   */
  filePath: string;

  /**
   * Does the file has formatting issues (needs format)
   */
  hasIssues: boolean;

  /**
   * The new file content after the formatting
   */
  newContent?: string;
};

export type FormatResults = {
  results: ComponentFormatResult[];
  errors: Error[];
};

export interface Formatter {
  id: string;
  format(context: FormatterContext): Promise<FormatResults>;
  formatSnippet(snippet: string, filepath?: string): Promise<string>;
  check(context: FormatterContext): Promise<FormatResults>;
}
