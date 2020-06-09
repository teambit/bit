import { ConcreteService } from '../environments/services/concrete-service';

export interface Compiler extends ConcreteService {
  compileFile: (
    fileContent: string,
    options: { componentDir: string; filePath: string }
  ) => Array<{ outputText: string; outputPath: string }> | null;
  compileOnCapsules(capsuleDirs: string[]): { resultCode: number; error: Error | null };
}
