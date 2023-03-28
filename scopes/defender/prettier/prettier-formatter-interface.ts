import { Formatter } from '@teambit/formatter';

export type IdeConfig = {
  prettierConfig: Object;
};

export interface PrettierFormatterInterface extends Formatter {
  generateIdeConfig?: () => IdeConfig;
}
