import { BabelAspect, BabelMain } from '@teambit/babel';
import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import DocsAspect, { DocsMain } from '@teambit/docs';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import MultiCompilerAspect, { MultiCompilerMain } from '@teambit/multi-compiler';
import ReactAspect, { ReactMain } from '@teambit/react';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { MDXAspect } from './mdx.aspect';
import { MDXCompiler, MDXCompilerOpts } from './mdx.compiler';
import { MDXDependencyDetector } from './mdx.detector';
import { MDXDocReader } from './mdx.doc-reader';
import { componentTemplates } from './mdx.templates';
import { babelConfig } from './babel/babel.config';

export type MDXConfig = {
  /**
   * list of file extensions to consider as MDX files.
   */
  extensions: string[];
};

export class MDXMain {
  icon() {
    return 'https://static.bit.dev/extensions-icons/mdx-icon-small.svg';
  }

  /**
   * create an instance of the MDX compiler.
   */
  createCompiler(opts: MDXCompilerOpts = {}) {
    const mdxCompiler = new MDXCompiler(MDXAspect.id, opts);
    return mdxCompiler;
  }

  static runtime = MainRuntime;
  static dependencies = [
    DocsAspect,
    DependencyResolverAspect,
    ReactAspect,
    EnvsAspect,
    MultiCompilerAspect,
    BabelAspect,
    CompilerAspect,
    GeneratorAspect,
  ];

  static defaultConfig = {
    extensions: ['.md', '.mdx'],
  };

  static async provider(
    [docs, depResolver, react, envs, multiCompiler, babel, compiler, generator]: [
      DocsMain,
      DependencyResolverMain,
      ReactMain,
      EnvsMain,
      MultiCompilerMain,
      BabelMain,
      CompilerMain,
      GeneratorMain
    ],
    config: MDXConfig
  ) {
    const mdx = new MDXMain();
    const mdxCompiler = multiCompiler.createCompiler(
      [
        // set the shouldCopyNonSupportedFiles to false since we don't want babel to copy the .mdx file to the dist folder (it will conflict with the .mdx.js file created by the mdx compiler)
        babel.createCompiler({ babelTransformOptions: babelConfig, shouldCopyNonSupportedFiles: false }),
        mdx.createCompiler({ ignoredPatterns: docs.getPatterns(), babelTransformOptions: babelConfig }),
        // set the shouldCopyNonSupportedFiles to false since we don't want ts to copy the .mdx file to the dist folder (it will conflict with the .mdx.js file created by the mdx compiler)
        react.reactEnv.getCompiler(undefined, {
          compileJs: false,
          compileJsx: false,
          shouldCopyNonSupportedFiles: false,
        }),
      ],
      {}
    );
    const mdxEnv = envs.compose(react.reactEnv, [
      react.overrideCompiler(mdxCompiler),
      react.overrideDependencies({
        dependencies: {
          '@teambit/mdx.ui.mdx-scope-context': '0.0.368',
          '@mdx-js/react': '1.6.22',
        },
      }),
      react.overrideCompilerTasks([compiler.createTask('MDXCompiler', mdxCompiler)]),
    ]);
    envs.registerEnv(mdxEnv);
    depResolver.registerDetector(new MDXDependencyDetector(config.extensions));
    docs.registerDocReader(new MDXDocReader(config.extensions));
    generator.registerComponentTemplate(componentTemplates);

    return mdx;
  }
}

MDXAspect.addRuntime(MDXMain);
