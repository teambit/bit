import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './files/component';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
// TODO @ranm8 Tests won't work in MDX until we add a Jest Transformer for the MDX env.
// import { testFile } from './files/test';

export const MDXComponent: ComponentTemplate = {
  name: 'mdx',
  description: 'MDX-file compiled by Bit to a reuseable component',

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { default as ${Name}, default } from './${name}.mdx';
`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context)];
  },
  config: {
    'teambit.mdx/mdx': {},
    'teambit.envs/envs': {
      env: 'teambit.mdx/mdx',
    },
  },
};

export const deprecatedMDXComponent: ComponentTemplate = {
  name: 'mdx-component',
  description: 'MDX-file compiled by Bit to a reuseable component',
  hidden: true,

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { default as ${Name} } from './${name}.mdx';
`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context)];
  },
  config: {
    'teambit.mdx/mdx': {},
    'teambit.envs/envs': {
      env: 'teambit.mdx/mdx',
    },
  },
};
