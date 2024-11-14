import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { PreviewMain } from './preview.main.runtime';

export class ServePreviewCmd implements Command {
  name = 'serve-preview';
  description = 'serve local preview bundle for components';
  group = 'development';
  options = [['p', 'port [port]', 'port to run the server on']] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private preview: PreviewMain
  ) {}

  async wait(args, options: { port: number }) {
    const res = await this.preview.serveLocalPreview(options);
    chalk.green(`preview server is listening on port ${res.port}`);
  }
}
