import type { FormatterContext } from './formatter-context';
import type { FormatResults } from '@teambit/envs.contracts';

export type { ComponentFormatResult, FileFormatResult, FormatResults } from '@teambit/envs.contracts';

export interface Formatter {
  id: string;
  format(context: FormatterContext): Promise<FormatResults>;
  formatSnippet(snippet: string, filepath?: string): Promise<string>;
  check(context: FormatterContext): Promise<FormatResults>;
}
