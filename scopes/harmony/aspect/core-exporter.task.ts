import path from 'path';
import fs from 'fs-extra';
import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { AspectLoaderMain, getCoreAspectName, getCoreAspectPackageName } from '@teambit/aspect-loader';
import { Capsule } from '@teambit/isolator';
import { Environment } from '@teambit/envs';

export class CoreExporterTask implements BuildTask {
  constructor(private env: Environment, private aspectLoader: AspectLoaderMain) {}

  location: TaskLocation = 'start';
  readonly aspectId = 'teambit.harmony/aspect';
  readonly name = 'CoreExporter';
  readonly description = 'export all core aspects via the main aspects';

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const mainAspect = this.aspectLoader.mainAspect;
    const capsules = context.capsuleNetwork.seedersCapsules;
    const mainAspectCapsule = capsules.find((capsule) => capsule.component.id.name === mainAspect.name);
    if (mainAspectCapsule) {
      const distDir = this.env.getCompiler().distDir;
      await this.addFolderForAllCoreAspects(mainAspectCapsule, distDir);
      await this.addFolderForHarmony(mainAspectCapsule, distDir);
    }

    return {
      componentsResults: [],
      artifacts: [],
    };
  }

  private addFolderForAllCoreAspects(mainAspectCapsule: Capsule, distDir: string) {
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const coreAspectsNamesPackages = coreAspectsIds.map((id) => {
      return {
        name: getCoreAspectName(id),
        packageName: getCoreAspectPackageName(id),
      };
    });
    const capsuleDir = mainAspectCapsule.path;
    const createBarrelFilesP = coreAspectsNamesPackages.map(async ({ name, packageName }) => {
      const newDirPath = path.join(capsuleDir, distDir, name);
      await fs.ensureDir(newDirPath);
      const barrelContent = generateBarrelFile(packageName);
      await fs.writeFile(path.join(newDirPath, 'index.js'), barrelContent);
    });
    return Promise.all(createBarrelFilesP);
  }

  private async addFolderForHarmony(mainAspectCapsule: Capsule, distDir: string) {
    const name = 'harmony';
    const packageName = '@teambit/harmony';
    const capsuleDir = mainAspectCapsule.path;
    const newDirPath = path.join(capsuleDir, distDir, name);
    await fs.ensureDir(newDirPath);
    const barrelContent = generateBarrelFile(packageName);
    await fs.writeFile(path.join(newDirPath, 'index.js'), barrelContent);
  }
}

function generateBarrelFile(packageName) {
  return `
Object.defineProperty(exports, "__esModule", { value: true });
// const aspect = require("${packageName}");
// module.exports = aspect;
module.exports.path = require.resolve("${packageName}");
`;
}
