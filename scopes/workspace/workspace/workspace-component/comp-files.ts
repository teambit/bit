import { ComponentID } from '@teambit/component-id';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { SourceFileModel } from '@teambit/legacy/dist/scope/models/version';

export class CompFiles {
  constructor(
    readonly id: ComponentID,
    private currentFiles: SourceFile[],
    private headFiles: SourceFileModel[] = []
  ) {}

  isModified(): boolean {
    if (!this.headFiles.length) return false;
    if (this.currentFiles.length !== this.headFiles.length) return true;
    return this.currentFiles.some((file) => {
      const headFile = this.headFiles.find((h) => h.relativePath === file.relative);
      if (!headFile) return true;
      return !headFile.file.isEqual(file.toSourceAsLinuxEOL().hash());
    });
  }
}
