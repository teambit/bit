import { ConcreteService } from '../environments/services/concrete-service';
import { ReleaseResults, ReleaseContext } from '../releases';

export interface Compiler extends ConcreteService {
  compileFile: (
    fileContent: string,
    options: { componentDir: string; filePath: string }
  ) => Array<{ outputText: string; outputPath: string }> | null;
  compileOnCapsules(context: ReleaseContext): Promise<ReleaseResults>;
}
