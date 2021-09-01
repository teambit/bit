import { flatten, compact } from 'lodash';
import { Linter, LinterContext, LintResults, ComponentLintResult } from '@teambit/linter';
import { ESLint as ESLintLib } from 'eslint';
import mapSeries from 'p-map-series';
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

  async lint(context: LinterContext): Promise<LintResults> {
    const longProcessLogger = this.logger.createLongProcessLogger('linting components', context.components.length);
    const resultsP = mapSeries(context.components, async (component) => {
      longProcessLogger.logProgress(component.id.toString());
      const eslint = this.createEslint(this.options.config, this.ESLint);
      const filesP = component.filesystem.files.map(async (file) => {
        // The eslint api ignore extensions by default when using lintText, so we do it manually
        if (!this.options.extensions?.includes(file.extname)) return undefined;
        const sourceCode = file.contents.toString('utf8');
        const lintResults = await eslint.lintText(sourceCode, {
          filePath: file.path,
          warnIgnored: true,
        });

        if (eslint && this.options.config.fix && lintResults) {
          await ESLintLib.outputFixes(lintResults);
        }

        return lintResults;
      });

      const files = await Promise.all(filesP);

      const results: ESLintLib.LintResult[] = compact(flatten(files));
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
    } = this.computeManyComponentsTotals(results);

    return {
      totalErrorCount,
      totalFatalErrorCount,
      totalFixableErrorCount,
      totalFixableWarningCount,
      totalWarningCount,
      results,
      errors: [],
    };
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
    componentsResults.forEach((result) => {
      totalErrorCount += result.totalErrorCount ?? 0;
      // @ts-ignore - missing from the @types/eslint lib
      totalFatalErrorCount += result.totalFatalErrorCount ?? 0;
      totalFixableErrorCount += result.totalFixableErrorCount ?? 0;
      totalFixableWarningCount += result.totalFixableWarningCount ?? 0;
      totalWarningCount += result.totalWarningCount ?? 0;
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
