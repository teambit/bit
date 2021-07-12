import { Component } from '@teambit/component';
import { FormatterContext } from './formatter-context';

export type ComponentFormatResult = {
  /**
   * id of the formatted component.
   */
  component: Component;

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
  format(context: FormatterContext): Promise<FormatResults>;
  check(context: FormatterContext): Promise<FormatResults>;
}
