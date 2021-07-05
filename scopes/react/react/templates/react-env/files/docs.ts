import { ComponentContext } from '@teambit/generator';
import { aspectReminder } from '../../common/docs-aspect-reminder';
import { envUsageInstructions } from '../../common/docs-env-usage-instructions';

export const docsFile = (context: ComponentContext) => {
  const { name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: A customised React component development environment 
labels: ['env', 'extension', 'example']
---

## Overview

A customised React development environment for building and rendering modular and reusable MFEs. Using this customised environment you can override 
environment configs such as tsconfig or even build tasks.

${envUsageInstructions(name)}

### Read more about Bit Environments and their customisation

Please see the following docs entries for more details on Bit Environments and customisation:
1. https://harmony-docs.bit.dev/building-with-bit/environments
1.  

${aspectReminder(name)}
`,
  };
};
