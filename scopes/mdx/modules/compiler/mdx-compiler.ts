import mdx from '@mdx-js/mdx';
import detectFrontmatter from 'remark-frontmatter';
import visit from 'unist-util-visit';
import remove from 'unist-util-remove';
import yaml from 'yaml';
import vfile from 'vfile';
import { CompileOutput } from './compile-output';

export type MDXCompileOptions = {
  remarkPlugins: any[];
  rehypePlugins: any[];
  compilers: any[];
  filepath?: string;
  renderer: string;
};

export const DEFAULT_RENDERER = `
import React from 'react'
import { mdx } from '@mdx-js/react'

/* @jsxRuntime classic */
/* @jsx mdx */
`;

function computeOptions(opts: Partial<MDXCompileOptions>) {
  const defaultOptions = {
    remarkPlugins: [],
    compilers: [],
    renderer: DEFAULT_RENDERER,
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
      return resolve(new CompileOutput(file, DEFAULT_RENDERER));
    });
  });
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
  const mustPlugins = [[detectFrontmatter, ['yaml']], extractFrontmatter];

  const compilerOpts = Object.assign(options, {
    remarkPlugins: options.remarkPlugins ? mustPlugins.concat(options.remarkPlugins) : mustPlugins,
  });

  const mdxCompiler = mdx.createCompiler(compilerOpts);
  return mdxCompiler;
}

function extractFrontmatter() {
  return function transformer(tree, file) {
    visit(tree, 'yaml', (node: any) => {
      file.data.frontmatter = yaml.parse(node.value);
    });

    remove(tree, 'yaml');
  };
}

function getFile(contents: string, path?: string) {
  if (!path) return vfile(contents);
  const contentFile = vfile({ contents, path });
  return contentFile;
}
