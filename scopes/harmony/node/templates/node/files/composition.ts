import { ComponentContext } from '@teambit/generator';

export function compositionFile(context: ComponentContext) {
  return {
    relativePath: `${context.name}.composition.tsx`,
    content: `import React from 'react';
import { ${context.nameCamelCase} } from './${context.name}';

export function ReturnsCorrectValue () {
  return (
    <div>
      {${context.nameCamelCase}()}
    </div>
  );
}
`,
  };
}
