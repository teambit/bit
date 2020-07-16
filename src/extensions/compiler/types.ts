import { ConcreteService } from '../environments/services/concrete-service';
import { BuildResults, BuildContext } from '../builder';

export type CompilerOpts = {
  componentDir: string;
  filePath: string;
};

export type CompilerOutput =
  | {
      outputText: string;
      outputPath: string;
    }[]
  | null;

export interface Compiler extends ConcreteService {
  /**
   * transpile a single file. this used by Bit for development.
   */
  compileFile: (fileContent: string, options: CompilerOpts) => CompilerOutput;

  /**
   * build component for production use.
   * @param context
   */
  compileOnCapsules(context: BuildContext): Promise<BuildResults>;
}
