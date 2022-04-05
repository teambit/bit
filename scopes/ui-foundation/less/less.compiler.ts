import { BuildContext, BuiltTaskResult } from '@teambit/builder';
import { render, version } from 'less';
import { Compiler } from '@teambit/compiler';

export class LessCompiler implements Compiler {
  distDir = 'dist';
  shouldCopyNonSupportedFiles = false;

  constructor(readonly id: string, readonly displayName = 'Less') {}

  getDistPathBySrcPath(srcPath: string): string {
    return srcPath.replace('.scss', '.css');
  }

  isFileSupported(filePath: string): boolean {
    return filePath.endsWith('.less');
  }

  version(): string {
    return version.join('.');
  }

  getDistDir() {
    return this.distDir;
  }

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
              const capsule = context.capsuleNetwork.seedersCapsules.getCapsule(component.id);
              if (capsule) capsule?.fs.writeFileSync(this.getDistPathBySrcPath(file.path), cssFile);

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
      // @ts-ignore TODO: fix this.
      componentsResults: results,
    };
  }
}
