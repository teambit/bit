import mapSeries from 'p-map-series';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { OnExportAspect } from './on-export.aspect';
export type Config = {};

export class OnExportMain {
  static runtime = MainRuntime;
  static dependencies: any = [ScopeAspect, LoggerAspect];

  static async provider([scope, loggerMain]: [ScopeMain, LoggerMain], config: Config, []: []) {
    const logger = loggerMain.createLogger(ScopeAspect.id);
    const onExportMain = new OnExportMain();
    scope.registerOnPostExport(async ({ ids }) => {
      // TODO: send event to bit.dev when export done
    });

    return onExportMain;
  }
}

OnExportAspect.addRuntime(OnExportMain);
