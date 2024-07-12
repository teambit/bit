import { PackageJsonFile } from '@teambit/component.sources';
import { Network } from '@teambit/isolator';
import { BuildContext, BuildTask, BuiltTaskResult } from '@teambit/builder';
import { TypescriptAspect } from './typescript.aspect';

export class RemoveTypesTask implements BuildTask {
  readonly aspectId = TypescriptAspect.id;
  readonly name = 'RemoveTypesProp';
  readonly description = 'remove the types prop from package.json';
  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    await this.removeTypesFromPkgJson(context.capsuleNetwork);

    const result = {
      componentsResults: [],
    };

    return result;
  }
  private async removeTypesFromPkgJson(capsuleNetwork: Network) {
    await Promise.all(
      capsuleNetwork.seedersCapsules.map(async (capsule) => {
        const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);
        // the types['index.ts'] is needed only during the build to avoid errors when tsc finds the
        // same type once in the d.ts and once in the ts file.
        // the reason for `packageJson.packageJsonObject.main` is that .d.ts components don't have a main file and they do need the types prop
        if (packageJson.packageJsonObject.types && packageJson.packageJsonObject.main) {
          delete packageJson.packageJsonObject.types;
          await packageJson.write();
        }
      })
    );
  }
}
