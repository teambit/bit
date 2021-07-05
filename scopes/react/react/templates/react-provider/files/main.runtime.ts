import { ComponentContext } from '@teambit/generator';
import { MainFileClass } from '../../common/common-env-main';

export const mainRuntimeFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  const moduleName = Name + 'Main';
  return {
    relativePath: `${context.name}.main.runtime.tsx`,
    content: `
    import { MainRuntime } from '@teambit/cli';
    import { EnvsAspect, EnvsMain } from '@teambit/envs';
    import { ReactAspect, ReactMain } from '@teambit/react';
    import { ${Name} } from './${name}.aspect';

    ${MainFileClass({ ...context, moduleName })}

  ${Name}.addRuntime(${moduleName});
  `,
  };
};
