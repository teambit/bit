import { flatten } from 'lodash';
import { Component } from '@teambit/component';
import { Linter, LinterContext } from '@teambit/linter';
import { ESLint } from 'eslint';
import { ESLintOptions } from './eslint.main.runtime';

export class ESLintLinter implements Linter {
  constructor(
    private options: ESLintOptions,

    /**
     * reference to the eslint module.
     */
    private ESLint?: any
  ) {}

  /**
   * get options for eslint.
   */
  private getOptions(options: ESLintOptions, context: LinterContext, component: Component): ESLint.Options {
    return {
      overrideConfig: options.config,
      extensions: context.extensionFormats,
      useEslintrc: false,
      cwd: options.pluginPath,
    };
  }

  async lint(context: LinterContext) {
    const resultsP = context.components.map(async (component) => {
      const eslint = this.createEslint(this.options, context, component, this.ESLint);
      const filesP = component.filesystem.files.map(async (file) => {
        const sourceCode = file.contents.toString('utf8');
        const lintResults = await eslint.lintText(sourceCode, {
          filePath: file.path,
          warnIgnored: true,
        });

        return lintResults;
      });

      const files = await Promise.all(filesP);

      const results: ESLint.LintResult[] = flatten(files);
      const formatter = await eslint.loadFormatter(this.options.formatter || 'stylish');
      const output = formatter.format(results);

      return {
        id: component.id,
        output,
        results: this.computeResults(results),
      };
    });

    const results = await Promise.all(resultsP);

    return {
      results,
      errors: [],
    };
  }

  private computeResults(results: ESLint.LintResult[]) {
    return results.map((result) => {
      return {
        filePath: result.filePath,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        messages: result.messages,
      };
    });
  }

  private createEslint(options: ESLintOptions, context: LinterContext, component: Component, ESLintModule?: any) {
    if (ESLintModule) new ESLintModule.ESLint(this.getOptions(options, context, component));
    return new ESLint(this.getOptions(options, context, component));
  }

  version() {
    if (this.ESLint) return this.ESLint.version;
    return ESLint.version;
  }
}
