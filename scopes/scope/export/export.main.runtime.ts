import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { ExportAspect } from './export.aspect';
import { ExportCmd } from './export-cmd';
import { ResumeExportCmd } from './resume-export-cmd';

export class ExportMain {
  static runtime: any = MainRuntime;

  static dependencies: any = [CLIAspect, ScopeAspect];

  static async provider([cli, scope]: [CLIMain, ScopeMain]) {
    cli.register(new ResumeExportCmd(scope), new ExportCmd());

    return new ExportMain();
  }
}

ExportAspect.addRuntime(ExportMain);
