import { CLIExtension } from '../cli';
import { ExportCmd } from './export-cmd';

export class ExportExtension {
  static id = '@teambit/export';

  static dependencies = [CLIExtension];

  static provider([cli]: [CLIExtension]) {
    cli.register(new ExportCmd());

    return new ExportExtension();
  }
}
