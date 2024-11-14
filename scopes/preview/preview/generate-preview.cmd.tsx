import { BitError } from '@teambit/bit-error';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Logger } from '@teambit/logger';
import openBrowser from 'react-dev-utils/openBrowser';
import chalk from 'chalk';
import type { PreviewMain } from './preview.main.runtime';

type GeneratePreviewArgs = [userPattern: string];
type GeneratePreviewFlags = {
  name: string;
};

export class GeneratePreviewCmd implements Command {
  name = 'generate-preview [component-pattern]';
  description = 'generate preview bundle for components';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'development';
  options = [['n', 'name <name>', 'name for the preview']] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private preview: PreviewMain
  ) {}

  async report([userPattern]: GeneratePreviewArgs, { name }: GeneratePreviewFlags) {
    const res = await this.preview.generateComponentPreview(userPattern, name);
    return chalk.green(`preview generated successfully ${res}`);
  }
}
