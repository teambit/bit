import { ComponentID } from '@teambit/component-id';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { SourceFileModel } from '@teambit/legacy/dist/scope/models/version';
import { Repository } from '@teambit/legacy/dist/scope/objects';

type FILE_STATUS = 'new' | 'modified' | 'deleted' | 'unchanged';
type PathLinux = string; // ts fails when importing it from @teambit/legacy/dist/utils/path.
export type FilesStatus = { [pathRelativeToCompDir: PathLinux]: FILE_STATUS };

export class CompFiles {
  constructor(
    readonly id: ComponentID,
    private repository: Repository,
    private currentFiles: SourceFile[],
    readonly compDir: PathLinux,
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

  getCurrentFiles(): SourceFile[] {
    return this.currentFiles;
  }

  async getHeadFiles(): Promise<SourceFile[]> {
    return Promise.all(this.headFiles.map((file) => SourceFile.loadFromSourceFileModel(file, this.repository)));
  }

  getFilesStatus(): FilesStatus {
    const result = this.currentFiles.reduce((acc, file) => {
      const headFile = this.headFiles.find((h) => h.relativePath === file.relative);
      const getType = (): FILE_STATUS => {
        if (!headFile) return 'new';
        if (headFile.file.isEqual(file.toSourceAsLinuxEOL().hash())) return 'unchanged';
        return 'modified';
      };
      acc[file.relative] = getType();
      return acc;
    }, {});
    this.headFiles.forEach((headFile) => {
      const currentFile = this.currentFiles.find((c) => c.relative === headFile.relativePath);
      if (!currentFile) {
        result[headFile.relativePath] = 'deleted';
      }
    });
    return result;
  }
}
