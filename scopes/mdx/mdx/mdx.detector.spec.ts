import { expect } from 'chai';
import { compileSync } from '@mdx-js/mdx';

// Mock @mdx-js/mdx and @teambit/mdx.modules.mdx-v3-options to avoid loading ESM-only
// modules (100+ packages in the unified/remark/rehype ecosystem) that Jest cannot
// handle in CJS mode due to missing require export conditions and ESM syntax.
jest.mock('@mdx-js/mdx', () => ({
  compileSync: jest.fn(),
}));
jest.mock('@teambit/mdx.modules.mdx-v3-options', () => ({
  mdxOptions: { remarkPlugins: [], jsxImportSource: 'react' },
}));

const mockCompileSync = compileSync as jest.Mock;

import { MDXDependencyDetector, detectImportsWithRegex } from './mdx.detector';

describe('MDXDependencyDetector', () => {
  beforeEach(() => {
    mockCompileSync.mockReset();
  });

  describe('detect - compileSync path', () => {
    it('should return modules from compileSync imports data', () => {
      mockCompileSync.mockReturnValue({
        data: { imports: [{ fromModule: 'react' }, { fromModule: '@teambit/design.ui.button' }] },
      });
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect('any source')).to.deep.equal(['react', '@teambit/design.ui.button']);
    });

    it('should return empty array when compileSync returns no imports', () => {
      mockCompileSync.mockReturnValue({ data: { imports: [] } });
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect('# Just markdown')).to.deep.equal([]);
    });

    it('should return empty array when imports data is undefined', () => {
      mockCompileSync.mockReturnValue({ data: {} });
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect('# No imports')).to.deep.equal([]);
    });

    it('should pass source and options to compileSync', () => {
      mockCompileSync.mockReturnValue({ data: { imports: [] } });
      const detector = new MDXDependencyDetector(['mdx']);
      detector.detect('test source');
      expect(mockCompileSync.mock.calls.length).to.equal(1);
      expect(mockCompileSync.mock.calls[0][0]).to.equal('test source');
    });
  });

  describe('detect - regex fallback on compileSync failure', () => {
    beforeEach(() => {
      mockCompileSync.mockImplementation(() => {
        throw new Error('MDX compilation failed');
      });
    });

    it('should fallback to regex when compileSync throws', () => {
      const src = `import React from 'react';`;
      const detector = new MDXDependencyDetector(['mdx']);
      expect(detector.detect(src)).to.deep.equal(['react']);
    });

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

describe('detectImportsWithRegex', () => {
  it('should detect default import', () => {
    expect(detectImportsWithRegex('import x from "y";')).to.deep.equal(['y']);
  });

  it('should detect star import', () => {
    expect(detectImportsWithRegex('import * as y from "y";')).to.deep.equal(['y']);
  });

  it('should detect named import', () => {
    expect(detectImportsWithRegex('import { x } from "y";')).to.deep.equal(['y']);
  });

  it('should detect side-effect import', () => {
    expect(detectImportsWithRegex('import "y";')).to.deep.equal(['y']);
  });

  it('should detect multiple imports', () => {
    const src = `
import React from 'react';
import { Button } from '@teambit/design.ui.button';
import * as utils from './utils';
    `;
    expect(detectImportsWithRegex(src)).to.deep.equal(['react', '@teambit/design.ui.button', './utils']);
  });

  it('should detect imports with single quotes', () => {
    expect(detectImportsWithRegex(`import x from 'single-quotes';`)).to.deep.equal(['single-quotes']);
  });

  it('should detect imports with double quotes', () => {
    expect(detectImportsWithRegex(`import x from "double-quotes";`)).to.deep.equal(['double-quotes']);
  });

  it('should detect imports with mixed quote styles', () => {
    const src = `
import a from 'single';
import b from "double";
    `;
    expect(detectImportsWithRegex(src)).to.deep.equal(['single', 'double']);
  });

  it('should detect TypeScript type imports', () => {
    const src = `
import type { MyType } from 'my-types';
import { Component } from 'my-component';
    `;
    expect(detectImportsWithRegex(src)).to.deep.equal(['my-types', 'my-component']);
  });

  it('should detect default and named imports combined', () => {
    expect(detectImportsWithRegex(`import React, { useState } from 'react';`)).to.deep.equal(['react']);
  });

  it('should detect imports with multiple named imports', () => {
    expect(detectImportsWithRegex(`import { foo, bar, baz } from 'multi-named';`)).to.deep.equal(['multi-named']);
  });

  it('should detect side-effect only imports', () => {
    expect(detectImportsWithRegex(`import 'side-effect';`)).to.deep.equal(['side-effect']);
  });

  it('should detect scoped package imports', () => {
    const src = `
import { Button } from '@scope/package';
import Utils from '@company/utils';
    `;
    expect(detectImportsWithRegex(src)).to.deep.equal(['@scope/package', '@company/utils']);
  });

  it('should detect relative path imports', () => {
    const src = `
import Local from './local';
import Parent from '../parent';
import Deep from '../../deep/path';
    `;
    expect(detectImportsWithRegex(src)).to.deep.equal(['./local', '../parent', '../../deep/path']);
  });

  it('should handle imports with extra whitespace', () => {
    const src = `
import    {    foo   ,   bar   }    from    'whitespace'   ;
import   *   as   util   from   'util'   ;
    `;
    expect(detectImportsWithRegex(src)).to.deep.equal(['whitespace', 'util']);
  });

  it('should detect imports mixed with complex MDX content', () => {
    const src = `
import React from 'react';
import { Button } from '@teambit/design.ui.button';

<!-- HTML comment -->
# Title

Some text with \\escaped characters

<Button>Click me</Button>
    `;
    const detected = detectImportsWithRegex(src);
    expect(detected).to.include('react');
    expect(detected).to.include('@teambit/design.ui.button');
  });

  it('should match imports in code blocks (known limitation)', () => {
    const src = `
import React from 'react';

\`\`\`jsx
import Example from 'example-in-code-block';
\`\`\`
    `;
    const detected = detectImportsWithRegex(src);
    expect(detected).to.include('react');
    expect(detected).to.include('example-in-code-block');
  });

  it('should return empty array for file with no imports', () => {
    const src = `
# Just a title

Some content without any imports.
    `;
    expect(detectImportsWithRegex(src)).to.deep.equal([]);
  });

  it('should return empty array for empty file', () => {
    expect(detectImportsWithRegex('')).to.deep.equal([]);
  });
});
