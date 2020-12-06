import { resolve } from 'path';
import type { PkgMain } from '@teambit/pkg';
import type { Component } from '@teambit/component';
import type { CompilerMain } from '@teambit/compiler';
import type { Workspace } from '@teambit/workspace';
import { DocReader } from './doc-reader';
import { Doc } from './doc';

export class DefaultDocReader implements DocReader {
  constructor(private pkg: PkgMain, private compiler: CompilerMain, private workspace: Workspace) {}

  async read(path: string, contents: Buffer, component: Component) {
    const packageName = this.pkg.getPackageName(component);
    const distPath = this.compiler.getDistPathBySrcPath(component, path);
    // eslint-disable-next-line
    const docsModule = require(resolve(`${this.workspace.path}/node_modules/${packageName}/${distPath}`));
    return Doc.from(path, {
      labels: docsModule.labels || docsModule.default?.labels,
      description: docsModule.abstract || docsModule.default?.abstract || docsModule.description,
      displayName: docsModule.displayName || docsModule.default?.componentDisplayName,
    });
  }

  readonly supportedExtensions = ['.ts', '.js', '.jsx', '.tsx'];

  isFormatSupported(format: string) {
    return this.supportedExtensions.includes(format);
  }
}
