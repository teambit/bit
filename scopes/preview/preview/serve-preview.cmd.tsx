import { Command, CommandOptions } from '@teambit/cli';
import type { PreviewMain } from './preview.main.runtime';

export class ServePreviewCmd implements Command {
  name = 'serve-preview';
  description = 'serve local preview bundle for components';
  group = 'development';
  options = [['p', 'port [port]', 'port to run the server on']] as CommandOptions;
  private = true;

  constructor(
    /**
     * access to the extension instance.
     */
    private preview: PreviewMain
  ) {}

  async wait(args, options: { port: number }) {
    await this.preview.serveLocalPreview(options);
  }
}
