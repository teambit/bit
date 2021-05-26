import { ComponentContext } from '@teambit/generator';

export const aspectFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.aspect.ts`,
    content: `import { Aspect } from '@teambit/harmony';

export type ${Name}Config = {
  // add configurable variables here

};

export const ${Name} = Aspect.create({
  id: 'my-org.my-aspect-scope/${name}', // IMPORTANT change these values to your own organization + scope
  defaultConfig: { } // add default config for above ${Name}Config here
});
`,
  };
};
