import fs from 'fs-extra';
import path from 'path';
import { flatten, compact } from 'lodash';
import { Linter, LinterContext, LintResults, ComponentLintResult } from '@teambit/linter';
import { ESLint as ESLintLib } from 'eslint';
import mapSeries from 'p-map-series';
import objectHash from 'object-hash';
import { ComponentMap } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { ESLintOptions } from './eslint.main.runtime';

export class ESLintLinter implements Linter {
  constructor(
    private logger: Logger,

    private options: ESLintOptions,

    /**
     * reference to the eslint module.
     */
    private ESLint?: any
  ) {}

  displayName = 'ESlint';

  displayConfig() {
    return JSON.stringify(this.options, null, 2);
  }

  async lint(context: LinterContext): Promise<LintResults> {
    const longProcessLogger = this.logger.createLongProcessLogger('linting components', context.components.length);
    const eslint = this.createEslint(this.options.config, this.ESLint);
    if (this.options.tsConfig && context.rootDir) {
      const tsConfigPath = this.createTempTsConfigFile(
        context.rootDir,
        context.componentsDirMap,
        context.envRuntime.id,
        this.options.tsConfig
      );
      if (this.options?.config?.overrideConfig?.parserOptions) {
        this.options.config.overrideConfig.parserOptions.project = tsConfigPath;
      }
    }
    const resultsP = mapSeries(context.components, async (component) => {
      longProcessLogger.logProgress(
        `component: ${component.id.toString()}, # of files: ${component.filesystem.files.length}`
      );
      const filesP = component.filesystem.files.map(async (file) => {
        // TODO: now that we moved to lint files, maybe it's not required anymore
        // The eslint api will not ignore extensions by default when using lintText, so we do it manually
        if (!this.options.extensions?.includes(file.extname)) return undefined;
        return file.path;
      });

      const files = compact(await Promise.all(filesP));
      const lintResults = await eslint.lintFiles(files);

      if (eslint && this.options.config.fix && lintResults) {
        await ESLintLib.outputFixes(lintResults);
      }

      const results: ESLintLib.LintResult[] = compact(flatten(lintResults));
      const formatter = await eslint.loadFormatter(this.options.formatter || 'stylish');
      const output = formatter.format(results);
      const {
        totalErrorCount,
        totalFatalErrorCount,
        totalFixableErrorCount,
        totalFixableWarningCount,
        totalWarningCount,
        componentsResults,
      } = this.computeComponentResultsWithTotals(results);

      return {
        component,
        output,
        totalErrorCount,
        totalFatalErrorCount,
        totalFixableErrorCount,
        totalFixableWarningCount,
        totalWarningCount,
        results: componentsResults,
      };
    });

    const results = (await resultsP) as any as ComponentLintResult[];
    const {
      totalErrorCount,
      totalFatalErrorCount,
      totalFixableErrorCount,
      totalFixableWarningCount,
      totalWarningCount,
      totalComponentsWithErrorCount,
      totalComponentsWithFatalErrorCount,
      totalComponentsWithFixableErrorCount,
      totalComponentsWithFixableWarningCount,
      totalComponentsWithWarningCount,
    } = this.computeManyComponentsTotals(results);

    return {
      totalErrorCount,
      totalFatalErrorCount,
      totalFixableErrorCount,
      totalFixableWarningCount,
      totalWarningCount,
      totalComponentsWithErrorCount,
      totalComponentsWithFatalErrorCount,
      totalComponentsWithFixableErrorCount,
      totalComponentsWithFixableWarningCount,
      totalComponentsWithWarningCount,
      results,
      errors: [],
    };
  }

  private createTempTsConfigFile(
    rootDir: string,
    componentDirMap: ComponentMap<string>,
    envId: string,
    tsConfig: Record<string, any>
  ): string {
    const newTsConfig = {
      ...tsConfig,
    };
    const compDirs: string[] = componentDirMap.toArray().map(([, compDir]) => compDir);
    if (tsConfig.include) {
      newTsConfig.include = flatten(tsConfig.include.map((includedPath) => {
        return compDirs.map((compDir) => `../../${compDir}/${includedPath}`);
      }));
    }
    if (tsConfig.exclude) {
      newTsConfig.exclude = flatten(tsConfig.exclude.map((excludedPath) => {
        return compDirs.map((compDir) => `../../${compDir}/${excludedPath}`);
      }));
    }
    const cacheDir = getCacheDir(rootDir);
    const hash = objectHash(newTsConfig);
    // We save the tsconfig with hash here to avoid creating unnecessary tsconfig files
    // this is very important as eslint will be able to cache the tsconfig file and will not need to create another program
    // this affects performance dramatically
    const tempTsConfigPath = path.join(cacheDir, `bit.tsconfig.eslint.${hash}.json`);
    if (!fs.existsSync(tempTsConfigPath)) {
      fs.outputJSONSync(tempTsConfigPath, newTsConfig, { spaces: 2 });
    }
    return tempTsConfigPath;
  }

  private computeComponentResultsWithTotals(results: ESLintLib.LintResult[]) {
    let totalErrorCount = 0;
    let totalFatalErrorCount = 0;
    let totalFixableErrorCount = 0;
    let totalFixableWarningCount = 0;
    let totalWarningCount = 0;
    const componentsResults = results.map((result) => {
      totalErrorCount += result.errorCount ?? 0;
      // @ts-ignore - missing from the @types/eslint lib
      totalFatalErrorCount += result.fatalErrorCount ?? 0;
      totalFixableErrorCount += result.fixableErrorCount ?? 0;
      totalFixableWarningCount += result.fixableWarningCount ?? 0;
      totalWarningCount += result.warningCount ?? 0;
      return {
        filePath: result.filePath,
        errorCount: result.errorCount,
        // @ts-ignore - missing from the @types/eslint lib
        fatalErrorCount: result.fatalErrorCount,
        fixableErrorCount: result.fixableErrorCount,
        fixableWarningCount: result.fixableWarningCount,
        warningCount: result.warningCount,
        messages: result.messages,
        raw: result,
      };
    });
    return {
      totalErrorCount,
      totalFatalErrorCount,
      totalFixableErrorCount,
      totalFixableWarningCount,
      totalWarningCount,
      componentsResults,
    };
  }

  private computeManyComponentsTotals(componentsResults: ComponentLintResult[]) {
    let totalErrorCount = 0;
    let totalFatalErrorCount = 0;
    let totalFixableErrorCount = 0;
    let totalFixableWarningCount = 0;
    let totalWarningCount = 0;
    let totalComponentsWithErrorCount = 0;
    let totalComponentsWithFatalErrorCount = 0;
    let totalComponentsWithFixableErrorCount = 0;
    let totalComponentsWithFixableWarningCount = 0;
    let totalComponentsWithWarningCount = 0;

    componentsResults.forEach((result) => {
      if (result.totalErrorCount) {
        totalErrorCount += result.totalErrorCount;
        totalComponentsWithErrorCount += 1;
      }
      // @ts-ignore - missing from the @types/eslint lib
      if (result.totalFatalErrorCount) {
        totalFatalErrorCount += result.totalFatalErrorCount;
        totalComponentsWithFatalErrorCount += 1;
      }
      if (result.totalFixableErrorCount) {
        totalFixableErrorCount += result.totalFixableErrorCount;
        totalComponentsWithFixableErrorCount += 1;
      }
      if (result.totalFixableWarningCount) {
        totalFixableWarningCount += result.totalFixableWarningCount;
        totalComponentsWithFixableWarningCount += 1;
      }
      if (result.totalWarningCount) {
        totalWarningCount += result.totalWarningCount;
        totalComponentsWithWarningCount += 1;
      }
    });
    return {
      totalErrorCount,
      totalFatalErrorCount,
      totalFixableErrorCount,
      totalFixableWarningCount,
      totalWarningCount,
      componentsResults,
      totalComponentsWithErrorCount,
      totalComponentsWithFatalErrorCount,
      totalComponentsWithFixableErrorCount,
      totalComponentsWithFixableWarningCount,
      totalComponentsWithWarningCount,
    };
  }

  /**
   * Create the eslint instance by options that was already merged with context
   * @param options
   * @param ESLintModule
   * @returns
   */
  private createEslint(options: ESLintLib.Options, ESLintModule?: any): ESLintLib {
    // eslint-disable-next-line no-new
    if (ESLintModule) new ESLintModule.ESLint(options);
    return new ESLintLib(options);
  }

  version() {
    if (this.ESLint) return this.ESLint.version;
    return ESLintLib.version;
  }
}

function getCacheDir(rootDir): string {
  return path.join(rootDir, 'node_modules', '.cache');
}
