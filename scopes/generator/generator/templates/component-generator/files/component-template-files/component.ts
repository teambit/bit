export const generateComponentFileContent = () => {
  return `import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: \`\${name}.tsx\`,
    content: \`import type { ReactNode } from 'react';

export type \${Name}Props = {
  children?: ReactNode;
};

export function \${Name}({ children }: \${Name}Props) {
  return (
    <div>
      {children}
    </div>
  );
}
\`,
  };
};
`;
};
