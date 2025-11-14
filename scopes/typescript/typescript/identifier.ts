import { isAbsolute, resolve, dirname, normalize } from 'path';
import { isRelativeImport } from '@teambit/legacy.utils';

export class Identifier {
  public readonly normalizedPath: string;

  constructor(
    readonly id: string,
    readonly filePath: string,
    readonly aliasId?: string,
    readonly sourceFilePath?: string
  ) {
    this.normalizedPath = Identifier.computeNormalizedPath(filePath, sourceFilePath);
  }

  private static computeNormalizedPath(filePath: string, sourceFilePath?: string): string {
    let effectivePath = filePath;
    const isAbsoluteSourceFilePath = sourceFilePath && isAbsolute(sourceFilePath);
    const isRelativeSourceFilePath = sourceFilePath && isRelativeImport(sourceFilePath);
    if (isAbsoluteSourceFilePath || isRelativeSourceFilePath) {
      effectivePath = isAbsoluteSourceFilePath ? sourceFilePath : resolve(dirname(filePath), sourceFilePath);
    }
    return normalize(effectivePath).replace(/\\/g, '/');
  }

  isEqual(identifier: Identifier): boolean {
    if (this.filePath !== identifier.filePath && this.normalizedPath !== identifier.normalizedPath) return false;
    if (Identifier.isDefault(identifier) && Identifier.isDefault(this)) return true;
    if (Identifier.isDefault(identifier) || Identifier.isDefault(this)) return false;
    return this.id === identifier.id;
  }

  static isDefault(identifier: Identifier) {
    return identifier.id === 'default';
  }
}
