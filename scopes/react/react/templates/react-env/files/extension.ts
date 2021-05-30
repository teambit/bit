import { ComponentContext } from '@teambit/generator';
import { MainFileClass } from '../../common/common-env-main';

export function extensionFile(context: ComponentContext) {
  const { namePascalCase: Name } = context;
  return `
  import { EnvsMain, EnvsAspect } from '@teambit/envs'
  import { ReactAspect, ReactMain } from '@teambit/react'

  ${MainFileClass({ ...context, moduleName: `${Name}Extension` })}
  `;
}
