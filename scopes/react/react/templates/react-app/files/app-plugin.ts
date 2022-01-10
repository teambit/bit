import { ComponentContext } from '@teambit/generator';

export function appPlugin({ name, namePascalCase: Name }: ComponentContext) {
  return `import { ReactAppOptions } from '@teambit/react';

export const ${Name}App: ReactAppOptions = {
  name: '${name}',
  entry: [require.resolve('./${name}.app-root')],
  prerender: {
    routes: ['/']
  }
};

export default ${Name}App;
`;
}
