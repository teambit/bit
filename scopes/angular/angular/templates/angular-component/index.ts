import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './src/lib/component';
import { moduleFile } from './src/lib/module';
import { docsFile } from './src/lib/docs';
import { componentSpecFile } from './src/lib/component-spec';
import { publicApiFile } from './src/public-api';

export const angularModule: ComponentTemplate = {
  name: 'ng-lib',
  description: 'a generic Angular library',
  hidden: true, // TODO(ocombe): remove this before release

  generateFiles(context: ComponentContext) {
    return [
      publicApiFile(context),
      componentFile(context),
      moduleFile(context),
      docsFile(context),
      componentSpecFile(context),
    ];
  },
};
