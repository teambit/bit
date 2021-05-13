import { MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { Compiler } from '@teambit/compiler';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { TsConfigSourceFile } from 'typescript';
import { NgPackagrOptions } from './ng-packagr-options';
import { NgPackagrAspect } from './ng-packagr.aspect';
import { NgPackagrCompiler } from './ng-packagr.compiler';

export class NgPackagrMain {
  static slots = [];
  static dependencies = [LoggerAspect, WorkspaceAspect];
  static runtime = MainRuntime;

  constructor(private logger: Logger, private workspace: Workspace) {}

  createCompiler(tsConfig?: TsConfigSourceFile, options: NgPackagrOptions = {}): Compiler {
    return new NgPackagrCompiler(NgPackagrAspect.id, this.logger, this.workspace, tsConfig, options);
  }

  static async provider([loggerExt, workspace]: [LoggerMain, Workspace]) {
    const logger = loggerExt.createLogger(NgPackagrAspect.id);
    return new NgPackagrMain(logger, workspace);
  }
}

NgPackagrAspect.addRuntime(NgPackagrMain);
