import { BuildContext, BuiltTaskResult } from '@teambit/builder';
import { render, version } from 'less';
import { Compiler, TranspileComponentParams, TranspileFileOutput, TranspileFileParams } from '@teambit/compiler';

export class LessCompiler implements Compiler {
  constructor(readonly id: string, readonly displayName = 'Less') {}

  async build(context: BuildContext): Promise<BuiltTaskResult> {
    const results = await Promise.all(
      context.components.flatMap((component) => {
        const lessFiles = component.filesystem.files.filter((file) => {
          return this.isFileSupported(file.path);
        });

        return Promise.all(
          lessFiles.map((file) => {
            try {
              const cssFile = render(file.contents);
              return {
                component,
              };
            } catch (err) {
              return {
                component,
                errors: [err],
              };
            }
          })
        );
      })
    );

    return {
      componentsResults: [],
    };
  }

  getDistPathBySrcPath(srcPath: string): string {
    return ``;
  }

  isFileSupported(filePath: string): boolean {
    return filePath.endsWith('.less');
  }

  version(): string {
    return version.join('.');
  }

  distDir = 'dist';
  shouldCopyNonSupportedFiles = false;
}
