import { expect } from 'chai';
import { MDXDependencyDetector } from './mdx.detector';

describe('MDXDependencyDetector', () => {
  function expectDependencies(src: string, expectedDeps: string[]) {
    expect(new MDXDependencyDetector(['mdx']).detect(src)).to.deep.equal(expectedDeps);
  }

  describe('detect - valid MDX syntax', () => {
    it('should correctly detect default import', () => {
      const src = 'import x from "y";';
      expectDependencies(src, ['y']);
    });

    it('should correctly detect star import', () => {
      const src = 'import * as y from "y";';
      expectDependencies(src, ['y']);
    });

    it('should correctly detect named import', () => {
      const src = 'import { x } from "y";';
      expectDependencies(src, ['y']);
    });

    it('should correctly detect import with no identifier', () => {
      const src = 'import "y";';
      expectDependencies(src, ['y']);
    });

    it('should correctly detect multiple imports', () => {
      const src = `
import React from 'react';
import { Button } from '@teambit/design.ui.button';
import * as utils from './utils';
      `;
      expectDependencies(src, ['react', '@teambit/design.ui.button', './utils']);
    });
  });

  describe('detect - regex fallback for legacy MDX syntax', () => {
    it('should fallback to regex when MDX contains HTML comments', () => {
      const src = `
import React from 'react';
import { Button } from '@teambit/base-ui.inputs.button';

<!-- This is an HTML comment that breaks MDX v3 -->
# Hello World
      `;
      expectDependencies(src, ['react', '@teambit/base-ui.inputs.button']);
    });

    it('should fallback to regex when MDX contains unclosed tags', () => {
      const src = `
import { Card } from '@teambit/design.ui.card';

<div>
# Content
      `;
      expectDependencies(src, ['@teambit/design.ui.card']);
    });

    it('should fallback to regex when MDX contains escaped characters in prose', () => {
      const src = `
import Component from './component';

Here's some text with \\escaped\\characters that MDX v3 doesn't like
      `;
      expectDependencies(src, ['./component']);
    });

    it('should fallback to regex when MDX contains bare variable declarations', () => {
      const src = `
import { useState } from 'react';

export const myVar = 'value';

# Component
      `;
      expectDependencies(src, ['react']);
    });
  });

  describe('detect - regex edge cases', () => {
    it('should detect imports with single quotes', () => {
      const src = `import x from 'single-quotes';`;
      expectDependencies(src, ['single-quotes']);
    });

    it('should detect imports with double quotes', () => {
      const src = `import x from "double-quotes";`;
      expectDependencies(src, ['double-quotes']);
    });

    it('should detect imports with mixed quote styles', () => {
      const src = `
import a from 'single';
import b from "double";
      `;
      expectDependencies(src, ['single', 'double']);
    });

    it('should detect TypeScript type imports', () => {
      const src = `
import type { MyType } from 'my-types';
import { Component } from 'my-component';
      `;
      expectDependencies(src, ['my-types', 'my-component']);
    });

    it('should detect default and named imports combined', () => {
      const src = `import React, { useState } from 'react';`;
      expectDependencies(src, ['react']);
    });

    it('should detect imports with multiple named imports', () => {
      const src = `import { foo, bar, baz } from 'multi-named';`;
      expectDependencies(src, ['multi-named']);
    });

    it('should detect side-effect only imports', () => {
      const src = `import 'side-effect';`;
      expectDependencies(src, ['side-effect']);
    });

    it('should detect scoped package imports', () => {
      const src = `
import { Button } from '@scope/package';
import Utils from '@company/utils';
      `;
      expectDependencies(src, ['@scope/package', '@company/utils']);
    });

    it('should detect relative path imports', () => {
      const src = `
import Local from './local';
import Parent from '../parent';
import Deep from '../../deep/path';
      `;
      expectDependencies(src, ['./local', '../parent', '../../deep/path']);
    });

    it('should handle imports with newlines and extra whitespace', () => {
      const src = `
import    {    foo   ,   bar   }    from    'whitespace'   ;
import   *   as   util   from   'util'   ;
      `;
      expectDependencies(src, ['whitespace', 'util']);
    });

    it('should detect imports in files with complex MDX content', () => {
      const src = `
import React from 'react';
import { Button } from '@teambit/design.ui.button';

<!-- HTML comment -->
# Title

Some text with \\escaped characters

<Button>Click me</Button>
      `;
      // Should detect the actual imports (this will trigger regex fallback due to HTML comment)
      const detected = new MDXDependencyDetector(['mdx']).detect(src);
      expect(detected).to.include('react');
      expect(detected).to.include('@teambit/design.ui.button');
    });

    it('should match imports in code blocks during regex fallback', () => {
      // Note: The regex fallback is intentionally simple and will match imports in code blocks.
      // This is an acceptable trade-off for the fallback mode, as the primary goal is dependency
      // detection rather than perfect accuracy. The normal MDX compilation path filters these correctly.
      const src = `
import React from 'react';

<!-- HTML comment triggers fallback -->

\`\`\`jsx
import Example from 'example-in-code-block';
\`\`\`
      `;
      const detected = new MDXDependencyDetector(['mdx']).detect(src);
      expect(detected).to.include('react');
      expect(detected).to.include('example-in-code-block');
    });
  });

  describe('detect - empty or no imports', () => {
    it('should return empty array for file with no imports', () => {
      const src = `
# Just a title

Some content without any imports.
      `;
      expectDependencies(src, []);
    });

    it('should return empty array for empty file', () => {
      const src = '';
      expectDependencies(src, []);
    });
  });
});
