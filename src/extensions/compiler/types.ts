import { ConcreteService } from '../environments/services/concrete-service';
import { BuildResults, BuildContext } from '../builder';

export interface Compiler extends ConcreteService {
  compileFile: (
    fileContent: string,
    options: { componentDir: string; filePath: string }
  ) => Array<{ outputText: string; outputPath: string }> | null;
  compileOnCapsules(context: BuildContext): Promise<BuildResults>;
}
