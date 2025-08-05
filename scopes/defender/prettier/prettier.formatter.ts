import type { AbstractVinyl } from '@teambit/component.sources';
import type {
  Formatter,
  FormatterContext,
  FormatResults,
  FileFormatResult,
  ComponentFormatResult,
} from '@teambit/formatter';
import type { Options as PrettierModuleOptions } from 'prettier';
// eslint-disable-next-line import/default
import PrettierLib from 'prettier';
import mapSeries from 'p-map-series';
import type { Logger } from '@teambit/logger';
import type { ExecutionContext } from '@teambit/envs';
// import { PrettierOptions } from './prettier.main.runtime';

export class PrettierFormatter implements Formatter {
  constructor(
    private logger: Logger,

    private options: PrettierModuleOptions,

    /**
     * reference to the prettier module.
     */
    private prettierModule = PrettierLib
  ) {}

  id = 'prettier-formatter';
  displayName = 'Prettier';

  displayConfig() {
    return JSON.stringify(this.options, null, 2);
  }

  async format(context: FormatterContext): Promise<FormatResults> {
    return this.run(context);
  }

  async formatSnippet(snippet: string, filePath?: string): Promise<string> {
    let parser;

    if (filePath) {
      const ext = filePath.split('.').pop();
      const supportInfo = await this.prettierModule.getSupportInfo();
      const language = supportInfo.languages.find((lang) => lang.extensions && lang.extensions.includes(`.${ext}`));

      if (language) {
        parser = language.parsers[0];
      }
    }

    parser = parser || 'babel';

    const optsWithFilePath = Object.assign({}, this.options, { filepath: filePath, parser });

    return this.prettierModule.format(snippet, optsWithFilePath);
  }

  async check(context: FormatterContext): Promise<FormatResults> {
    return this.run(context);
  }

  private async run(context: FormatterContext & ExecutionContext): Promise<FormatResults> {
    const check = !!context.check;
    const longProcessLogger = this.logger.createLongProcessLogger('formatting components', context.components.length);
    const resultsP = mapSeries(context.components, async (component): Promise<ComponentFormatResult> => {
      longProcessLogger.logProgress(component.id.toString());
      const mergedOpts = this.getOptions(this.options, context);
      const filesP = component.filesystem.files.map(async (file): Promise<FileFormatResult> => {
        const sourceCode = file.contents.toString('utf8');
        const optsWithFilePath = this.addFilePathToOpts(mergedOpts, file);
        const checkFormatResults = await this.prettierModule.check(sourceCode, optsWithFilePath);
        const formatResults = await this.prettierModule.format(sourceCode, optsWithFilePath);

        const hasIssues = !checkFormatResults;
        const newContent = typeof formatResults === 'string' && hasIssues ? formatResults : undefined;

        if (!check && newContent) {
          file.contents = Buffer.from(newContent);
          await file.write(undefined, true);
        }

        return {
          filePath: file.relative,
          hasIssues,
          newContent,
        };
      });

      const files = await Promise.all(filesP);

      return {
        component,
        results: files,
      };
    });

    const results = await resultsP;

    return {
      results,
      errors: [],
    };
  }

  /**
   * get options for eslint.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getOptions(options: PrettierModuleOptions, context: FormatterContext): PrettierModuleOptions {
    return options;
  }

  private addFilePathToOpts(options: PrettierModuleOptions, file: AbstractVinyl): PrettierModuleOptions {
    return Object.assign({}, options, { filepath: file.path });
  }

  version() {
    return this.prettierModule.version;
  }
}
