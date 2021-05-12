import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.mdx`,
    content: `# Title - ${Name}

This is markdown.

<p>This is HTML</p>

# Import a React Component or use HTML

<button>Button 👋 </button>
`,
  };
};
