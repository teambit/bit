import { Config } from '@stencil/core';
import { createCompiler, loadConfig, TranspileOptions, transpileSync } from '@stencil/core/compiler';
import { createNodeLogger, createNodeSys } from '@stencil/core/sys/node';
import { sass } from '@stencil/sass';
import { BuildContext, BuildResults } from '@teambit/builder';
import { Compiler, TranspileOpts, TranspileOutput } from '@teambit/compiler';
import fs from 'fs-extra';
import merge from 'lodash.merge';
import path from 'path';

import { TypeScriptCompilerOptions } from '../typescript/compiler-options';
import { getStencilConfigFile } from './stencil.config';

export class StencilCompiler implements Compiler {
  constructor(
    private transpileOpts: TranspileOptions,
    private stencilConfigOptions: Config,
    private tsConfigOptions: TypeScriptCompilerOptions
  ) {}

  transpileFile(fileContent: string, options: TranspileOpts): TranspileOutput {
    const output = transpileSync(fileContent, this.transpileOpts);
    const outputPath = this.replaceFileExtToJs(options.filePath);
    return [
      {
        outputText: output.code,
        outputPath,
      },
    ];
  }

  getDistDir(): string {
    return 'dist';
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getDistPathBySrcPath(srcPath: string): string {
    return path.join(this.getDistDir());
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isFileSupported(filePath: string): boolean {
    return (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) && !filePath.endsWith('.d.ts');
  }

  async build(context: BuildContext): Promise<BuildResults> {
    const capsules = context.capsuleGraph.capsules;
    const capsuleDirs = capsules.getAllCapsuleDirs();
    // eslint-disable-next-line no-console
    console.log('\ncapsuleDirs', capsuleDirs);
    await Promise.all(
      capsules.map(async (caps) => {
        // @ts-ignore need to update TypeScriptCompilerOptions
        this.tsConfigOptions.include = caps.capsule.component.filesystem.files.map((f) => {
          return f.path;
        });
        await this.writeTsConfig(caps.capsule.path);
        await this.writeStencilConfig(caps.capsule.path);
        const nodeLogger = createNodeLogger({ process });
        const nodeSys = createNodeSys({ process });
        let stencilConfig: Config = {
          /* user config */
          namespace: caps.capsule.component.id.name,
          tsconfig: `${caps.capsule.path}/tsconfig.json`,
          plugins: [sass()],
        };
        stencilConfig = merge(stencilConfig, this.stencilConfigOptions);
        const validated = await loadConfig({
          logger: nodeLogger,
          sys: nodeSys,
          config: stencilConfig,
          configPath: `${caps.capsule.path}/stencil.config.ts`,
        });
        const compiler = await createCompiler(validated.config);
        await compiler.build();
      })
    );

    const components = capsules.map((capsule) => {
      const id = capsule.id;
      const errors = [];
      return { id, errors };
    });

    return { artifacts: [{ dirName: this.getDistDir() }], components };
  }

  private async writeTsConfig(dir: string) {
    const tsconfigStr = JSON.stringify(this.tsConfigOptions, undefined, 2);
    await fs.writeFile(path.join(dir, 'tsconfig.json'), tsconfigStr);
  }

  private async writeStencilConfig(dir: string) {
    await fs.writeFile(path.join(dir, 'stencil.config.ts'), getStencilConfigFile());
  }

  private replaceFileExtToJs(filePath: string): string {
    if (!this.isFileSupported(filePath)) return filePath;
    const fileExtension = path.extname(filePath);
    return filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
  }
}
