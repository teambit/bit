import { GeneratorContext } from '@teambit/generator';

export const docsFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['extention', 'react', 'env', 'environment']
description: 'A customized extention for React environment.'
---

This is a customized extension for React, based of the [React Aspect](https://bit.dev/teambit/react/react).

Explain here the modified configurations and tools applied.

`,
  };
};
