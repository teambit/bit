import mdx from '@mdx-js/mdx';
import detectFrontmatter from 'remark-frontmatter';
import visit from 'unist-util-visit';
import remove from 'unist-util-remove';
import remarkNotes from 'remark-admonitions';
import detectiveEs6 from '@teambit/node.deps-detectors.detective-es6';
import yaml from 'yaml';
import vfile from 'vfile';
import { CompileOutput } from './compile-output';
import { ImportSpecifier } from './import-specifier';

export type MDXCompileOptions = {
  remarkPlugins: any[];
  rehypePlugins: any[];
  compilers: any[];
  filepath?: string;
  renderer: string;
  bitFlavour: boolean;
};

export const DEFAULT_RENDERER = `
// @ts-nocheck
import React from 'react'
import { mdx } from '@mdx-js/react'

/* @jsxRuntime classic */
/* @jsx mdx */
`;

function computeOptions(opts: Partial<MDXCompileOptions>) {
  const defaultOptions = {
    remarkPlugins: [remarkNotes],
    compilers: [],
    renderer: DEFAULT_RENDERER,
    bitFlavour: true,
  };

  return Object.assign(defaultOptions, opts);
}

/**
 * compile an mdx file with frontmatter formatted (yaml) metadata.
 * example:
 * ```
 * ---
 * title: Something
 * labels: ['some', 'labels']
 * ---
 * ```
 */
export function compile(content: string, options: Partial<MDXCompileOptions> = {}): Promise<CompileOutput> {
  const contentFile = getFile(content, options.filepath);
  return new Promise((resolve, reject) => {
    const opts = computeOptions(options);
    const mdxCompiler = createCompiler(opts);

    mdxCompiler.process(contentFile, (err: Error | undefined, file: any) => {
      if (err) return reject(err);
      const output = new CompileOutput(file, DEFAULT_RENDERER);
      return resolve(output);
    });
  });
}

export function wrapWithScopeContext() {
  return (tree, file) => {
    const imports: ImportSpecifier[] = file.data?.imports || [];
    const ids = imports.reduce<string[]>((identifiers: string[], importSpecifier: ImportSpecifier) => {
      const newIds: string[] = [];
      if (importSpecifier.identifier) newIds.push(importSpecifier.identifier);
      return identifiers.concat(newIds);
    }, []);

    const preNode = {
      type: 'jsx',
      value: `<MDXScopeProvider components={{${ids.join(', ')}}}>`,
    };

    const postNode = {
      type: 'jsx',
      value: `</MDXScopeProvider>`,
    };

    tree.children.unshift({
      type: 'import',
      value: `import { MDXScopeProvider } from '@teambit/mdx.ui.mdx-scope-context';`,
    });

    tree.children.unshift(preNode);
    tree.children.push(postNode);
  };
}

/**
 * sync compilation of mdx content.
 * @param mdxContent
 * @param options
 */
export function compileSync(mdxContent: string, options: Partial<MDXCompileOptions> = {}): CompileOutput {
  const contentFile = getFile(mdxContent, options.filepath);
  const opts = computeOptions(options);
  const mdxCompiler = createCompiler(opts);

  const file = mdxCompiler.processSync(contentFile);
  return new CompileOutput(file, DEFAULT_RENDERER);
}

function createCompiler(options: Partial<MDXCompileOptions>) {
  const mustPlugins = options.bitFlavour
    ? [[detectFrontmatter, ['yaml']], extractMetadata, extractImports]
    : [extractImports];
  const mustRehypePlugins = options.bitFlavour ? [wrapWithScopeContext] : [];

  const compilerOpts = Object.assign(options, {
    remarkPlugins: options.remarkPlugins ? mustPlugins.concat(options.remarkPlugins) : mustPlugins,
    rehypePlugins: options.rehypePlugins ? mustRehypePlugins.concat(options.rehypePlugins) : mustRehypePlugins,
  });

  const mdxCompiler = mdx.createCompiler(compilerOpts);
  return mdxCompiler;
}

function extractMetadata() {
  return function transformer(tree, file) {
    visit(tree, 'yaml', (node: any) => {
      try {
        file.data.frontmatter = yaml.parse(node.value, { prettyErrors: true });
      } catch (err: any) {
        throw new Error(
          `failed extracting metadata/front-matter using Yaml lib, due to an error (please disregard the line/column): ${err.message}`
        );
      }
    });
  };
}

function extractImports() {
  return function transformer(tree, file) {
    visit(tree, 'import', (node: any) => {
      const es6Import = detectiveEs6(node.value);
      const imports: ImportSpecifier[] = Object.keys(es6Import).flatMap((dep) => {
        if (!es6Import[dep].importSpecifiers) {
          return {
            fromModule: dep,
          };
        }
        return es6Import[dep].importSpecifiers.map((importSpecifier) => ({
          fromModule: dep,
          identifier: importSpecifier.name,
          isDefault: importSpecifier.isDefault,
        }));
      });
      (file.data.imports ||= []).push(...imports);
    });

    remove(tree, 'yaml');
  };
}

function getFile(contents: string, path?: string) {
  if (!path) return vfile(contents);
  const contentFile = vfile({ contents, path });
  return contentFile;
}
