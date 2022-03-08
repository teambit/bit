import { ComponentContext } from '@teambit/generator';

const regex = /([A-Z])([A-Z])([a-z])|([a-z])([A-Z])/g;

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.mdx`,
    content: `# ${Name.replace(regex, '$1$4 $2$3$5')}

This is markdown.

<p>This is HTML</p>

# Import a React Component or use HTML

<button>Button 👋 </button>
`,
  };
};
