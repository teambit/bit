import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';

import { ExportAspect } from './export.aspect';
import { ExportCmd } from './export-cmd';
import { ResumeExportCmd } from './resume-export-cmd';

export class ExportMain {
  static runtime = MainRuntime;

  static dependencies = [CLIAspect, ScopeAspect, CommunityAspect];

  static async provider([cli, scope, community]: [CLIMain, ScopeMain, CommunityMain]) {
    cli.register(new ResumeExportCmd(scope), new ExportCmd(community.getDocsDomain()));

    return new ExportMain();
  }
}

ExportAspect.addRuntime(ExportMain);
