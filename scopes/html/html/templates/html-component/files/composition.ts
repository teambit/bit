import { ComponentContext } from '@teambit/generator';

export const compositionFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.composition.ts`,
    content: `
import { ${Name} } from './${name}';

export const Basic${Name} = ${Name}({text:"Some basic composition text"});
`,
  };
};
