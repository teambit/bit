import type { ComponentContext } from '@teambit/generator';

export function taskFile({ namePascalCase }: ComponentContext) {
  return `import {
  BuildTask,
  BuildContext,
  BuiltTaskResult,
  ComponentResult,
} from '@teambit/builder';
import path from 'path';
import fs from 'fs';

export class ${namePascalCase} implements BuildTask {
  constructor(readonly aspectId: string) {}
  readonly name = '${namePascalCase}';

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    // Prepare the component results array which will be used to report back the components processed
    // as well as any additional data regarding this build task execution
    const componentsResults: ComponentResult[] = [];
    // The 'seeder capsules' are capsules for components that are built for their own sake - 
    // not for the sake of other components that have them as their dependencies
    const capsules = context.capsuleNetwork.seedersCapsules;
    capsules.forEach((capsule) => {
      // Prepare an 'errors' array to report back of any errors during execution (this will be part of the 'Component Results' data)
      const errors: Error[] = [];
      // Each 'capsule' provides data regarding the component as well as the capsule itself
      const componentName = capsule.component.id.name;
      const capsuleDir = capsule.path;

      const artifactContent = \`The component name is \${componentName}\`

      try {
        // Generate the artifact inside the capsule's directory
        fs.writeFileSync(
          path.join(capsuleDir, 'output.my-artifact.txt'),
          artifactContent
        );
      } catch (err: any) {
        errors.push(err);
      }
      componentsResults.push({ component: capsule.component, errors });
    });

    return {
      artifacts: [
        {
          generatedBy: this.aspectId,
          name: this.name,
          // The glob pattern for artifacts to include in the component version
          globPatterns: ['**/*.my-artifact.txt'],
        },
      ],
      componentsResults,
    };
  }
}`;
}
