import { expect } from 'chai';

import { MDXDependencyDetector } from './mdx.detector';

describe('MDXDependencyDetector', () => {
  describe('detect - compileSync path', () => {
    it('should return modules from compileSync imports data', () => {
      const src = `import React from 'react';
import { Button } from '@teambit/design.ui.button';

# Hello World
`;
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect(src)).to.deep.equal(['react', '@teambit/design.ui.button']);
    });

    it('should return empty array when the source has no imports', () => {
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect('# Just markdown')).to.deep.equal([]);
    });
  });

  describe('detect - regex fallback on compileSync failure', () => {
    it('should detect imports when MDX contains HTML comments', () => {
      const src = `
import React from 'react';
import { Button } from '@teambit/base-ui.inputs.button';

<!-- This is an HTML comment that breaks MDX v3 -->
# Hello World
      `;
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect(src)).to.deep.equal(['react', '@teambit/base-ui.inputs.button']);
    });

    it('should detect imports when MDX contains unclosed tags', () => {
      const src = `
import { Card } from '@teambit/design.ui.card';

<div>
# Content
      `;
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect(src)).to.deep.equal(['@teambit/design.ui.card']);
    });

    it('should detect imports when MDX contains escaped characters', () => {
      const src = `
import Component from './component';

Here's some text with \\escaped\\characters that MDX v3 doesn't like
      `;
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect(src)).to.deep.equal(['./component']);
    });
  });

  describe('compilation failure warning', () => {
    const src = `<!-- an html comment -->
import { Button } from './button';
`;
    const createLogger = () => {
      const calls = { warning: 0, debug: 0 };
      const logger = { consoleWarning: () => calls.warning++, debug: () => calls.debug++ } as any;
      return { logger, calls };
    };

    it('should warn for .mdx files', () => {
      const { logger, calls } = createLogger();
      const detector = new MDXDependencyDetector(['.mdx'], logger);
      detector.isSupported({ ext: '.mdx', filename: '/ws/comp/docs.mdx' } as any);
      expect(detector.detect(src)).to.deep.equal(['./button']);
      expect(calls).to.deep.equal({ warning: 1, debug: 0 });
    });

    it('should not warn for plain .md files', () => {
      const { logger, calls } = createLogger();
      const detector = new MDXDependencyDetector(['.md'], logger);
      detector.isSupported({ ext: '.md', filename: '/ws/comp/readme.md' } as any);
      expect(detector.detect(src)).to.deep.equal(['./button']);
      expect(calls).to.deep.equal({ warning: 0, debug: 1 });
    });
  });

  describe('isSupported', () => {
    it('should return true for supported extensions', () => {
      const detector = new MDXDependencyDetector(['mdx', 'md']);
      expect(detector.isSupported({ ext: 'mdx', filename: 'test.mdx' } as any)).to.be.true;
      expect(detector.isSupported({ ext: 'md', filename: 'test.md' } as any)).to.be.true;
    });

    it('should return false for unsupported extensions', () => {
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.isSupported({ ext: 'ts', filename: 'test.ts' } as any)).to.be.false;
    });
  });
});
