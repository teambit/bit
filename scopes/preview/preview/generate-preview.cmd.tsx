import padRight from 'pad-right';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import type { PreviewMain } from './preview.main.runtime';
import { EnvsExecutionResult } from '@teambit/envs';

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
  private = true;

  constructor(
    /**
     * access to the extension instance.
     */
    private preview: PreviewMain
  ) {}

  async report([userPattern]: GeneratePreviewArgs, { name }: GeneratePreviewFlags) {
    const res = await this.preview.generateComponentPreview(userPattern, name);
    const formattedOutput = this.formatOutput(res);
    return chalk.green(`previews generated successfully in:\n${formattedOutput}`);
  }

  formatOutput(res: EnvsExecutionResult<{ [id: string]: string }>) {
    const merged = res.results.reduce((acc, result) => {
      acc = { ...acc, ...result.data };
      return acc;
    }, {});
    const rows = Object.entries(merged).map(([id, previewPath]) => {
      const keyPadded = padRight(id, 20, ' ');
      return chalk.green(`${keyPadded} - ${previewPath}`);
    });
    return rows.join('\n');
  }
}
