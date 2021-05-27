import { ComponentContext } from '@teambit/generator';
import { MainFileContents } from '../../common/common-env-main';

export const mainRuntimeFile = (context: ComponentContext) => {
  return {
    relativePath: `${context.name}.main.runtime.tsx`,
    content: MainFileContents(context),
  };
};
