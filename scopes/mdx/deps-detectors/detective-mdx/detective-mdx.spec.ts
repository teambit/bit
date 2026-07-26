import { expect } from 'chai';
import { detective } from './detective-mdx';

describe('detective-mdx', () => {
  describe('import statement forms', () => {
    it('should detect a default import', () => {
      expect(detective(`import React from 'react';`)).to.deep.equal(['react']);
    });

    it('should detect a named import', () => {
      expect(detective(`import { Button } from '@teambit/base-ui.inputs.button';`)).to.deep.equal([
        '@teambit/base-ui.inputs.button',
      ]);
    });

    it('should detect a namespace import', () => {
      expect(detective(`import * as utils from 'lodash';`)).to.deep.equal(['lodash']);
    });

    it('should detect a mixed default and named import', () => {
      expect(detective(`import React, { useState } from 'react';`)).to.deep.equal(['react']);
    });

    it('should detect a type-only import', () => {
      expect(detective(`import type { Props } from './props';`)).to.deep.equal(['./props']);
    });

    it('should detect a side-effect only import', () => {
      expect(detective(`import './styles.css';`)).to.deep.equal(['./styles.css']);
    });

    it('should detect multiple imports', () => {
      const src = `import React from 'react';
import { Card } from '@teambit/design.ui.card';

# Hello World`;
      expect(detective(src)).to.deep.equal(['react', '@teambit/design.ui.card']);
    });

    it('should support double quotes', () => {
      expect(detective(`import React from "react";`)).to.deep.equal(['react']);
    });

    it('should return an empty array for markdown without imports', () => {
      expect(detective(`# Just markdown\n\nsome prose with the word import in it.`)).to.deep.equal([]);
    });
  });

  describe('content the mdx compiler rejects', () => {
    it('should detect imports when the file contains HTML comments', () => {
      const src = `import React from 'react';

<!-- an HTML comment, invalid in MDX v3 -->
# Hello`;
      expect(detective(src)).to.deep.equal(['react']);
    });

    it('should detect imports when the file contains unclosed tags', () => {
      const src = `import { Card } from '@teambit/design.ui.card';

<br>
# Hello`;
      expect(detective(src)).to.deep.equal(['@teambit/design.ui.card']);
    });
  });

  describe('documentation examples must not become dependencies', () => {
    it('should ignore imports inside fenced code blocks', () => {
      const src = `import { Button } from '@teambit/design.ui.button';

\`\`\`js
import { Example } from '@my-org/my-scope.examples.example';
\`\`\``;
      expect(detective(src)).to.deep.equal(['@teambit/design.ui.button']);
    });

    it('should ignore imports inside tilde-fenced code blocks', () => {
      const src = `~~~ts
import { Example } from '@my-org/my-scope.examples.example';
~~~`;
      expect(detective(src)).to.deep.equal([]);
    });

    it('should ignore imports inside inline code spans', () => {
      const src = 'to use it, run `import x from "some-pkg"` in your file';
      expect(detective(src)).to.deep.equal([]);
    });

    it('should ignore imports inside HTML comments', () => {
      const src = `<!-- import hidden from 'hidden-pkg'; -->`;
      expect(detective(src)).to.deep.equal([]);
    });

    it('should ignore imports inside JSX comments', () => {
      const src = `{/* import hidden from 'hidden-pkg'; */}`;
      expect(detective(src)).to.deep.equal([]);
    });

    it('should ignore an indented import (not a block-level ESM statement)', () => {
      const src = `    import indented from 'not-esm';`;
      expect(detective(src)).to.deep.equal([]);
    });
  });
});
