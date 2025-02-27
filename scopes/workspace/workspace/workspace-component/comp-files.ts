import { ComponentID } from '@teambit/component-id';
import { SourceFile } from '@teambit/component.sources';
import { Repository, SourceFileModel } from '@teambit/objects';

type FILE_STATUS = 'new' | 'modified' | 'deleted' | 'unchanged';
type PathLinux = string; // ts fails when importing it from @teambit/legacy/dist/utils/path.
export type FilesStatus = { [pathRelativeToCompDir: PathLinux]: FILE_STATUS };

export class CompFiles {
  constructor(
    readonly id: ComponentID,
    private repository: Repository,
    private currentFiles: SourceFile[],
    readonly compDir: PathLinux,
    private modelFiles: SourceFileModel[] = []
  ) {}

  isModified(): boolean {
    if (!this.modelFiles.length) return false;
    if (this.currentFiles.length !== this.modelFiles.length) return true;
    return this.currentFiles.some((file) => {
      const headFile = this.modelFiles.find((h) => h.relativePath === file.relative);
      if (!headFile) return true;
      return !headFile.file.isEqual(file.toSourceAsLinuxEOL().hash());
    });
  }

  getCurrentFiles(): SourceFile[] {
    return this.currentFiles;
  }

  async getHeadFiles(): Promise<SourceFile[]> {
    return Promise.all(this.modelFiles.map((file) => SourceFile.loadFromSourceFileModel(file, this.repository)));
  }

  getFilesStatus(): FilesStatus {
    const result = this.currentFiles.reduce((acc, file) => {
      const headFile = this.modelFiles.find((h) => h.relativePath === file.relative);
      const getType = (): FILE_STATUS => {
        if (!headFile) return 'new';
        if (headFile.file.isEqual(file.toSourceAsLinuxEOL().hash())) return 'unchanged';
        return 'modified';
      };
      acc[file.relative] = getType();
      return acc;
    }, {});
    this.modelFiles.forEach((headFile) => {
      const currentFile = this.currentFiles.find((c) => c.relative === headFile.relativePath);
      if (!currentFile) {
        result[headFile.relativePath] = 'deleted';
      }
    });
    return result;
  }
}
