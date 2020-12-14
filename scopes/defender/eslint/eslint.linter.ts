import { flatten } from 'lodash';
import { Linter, LinterContext } from '@teambit/linter';
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

  // @ts-ignore
  async lint(context: LinterContext) {
    const longProcessLogger = this.logger.createLongProcessLogger('linting components', context.components.length);
    const resultsP = mapSeries(context.components, async (component) => {
      longProcessLogger.logProgress(component.id.toString());
      const eslint = this.createEslint(this.options, context, this.ESLint);
      const filesP = component.filesystem.files.map(async (file) => {
        const sourceCode = file.contents.toString('utf8');
        const lintResults = await eslint.lintText(sourceCode, {
          filePath: file.path,
          warnIgnored: true,
        });

        return lintResults;
      });

      const files = await Promise.all(filesP);

      const results: ESLintLib.LintResult[] = flatten(files);
      const formatter = await eslint.loadFormatter(this.options.formatter || 'stylish');
      const output = formatter.format(results);

      return {
        component,
        output,
        results: this.computeResults(results),
      };
    });

    const results = await resultsP;

    return {
      results,
      errors: [],
    };
  }

  private computeResults(results: ESLintLib.LintResult[]) {
    return results.map((result) => {
      return {
        filePath: result.filePath,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        messages: result.messages,
      };
    });
  }

  private createEslint(options: ESLintOptions, context: LinterContext, ESLintModule?: any): ESLintLib {
    // eslint-disable-next-line no-new
    if (ESLintModule) new ESLintModule.ESLint(this.getOptions(options, context));
    return new ESLintLib(this.getOptions(options, context));
  }

  /**
   * get options for eslint.
   */
  private getOptions(options: ESLintOptions, context: LinterContext): ESLintLib.Options {
    return {
      overrideConfig: options.config,
      extensions: context.extensionFormats,
      useEslintrc: false,
      cwd: options.pluginPath,
    };
  }

  version() {
    if (this.ESLint) return this.ESLint.version;
    return ESLintLib.version;
  }
}
