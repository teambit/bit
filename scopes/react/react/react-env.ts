import type { Linter, LinterContext } from '@teambit/linter';
import type { Formatter, FormatterContext } from '@teambit/formatter';
import type { Tester, TesterContext } from '@teambit/tester';
import type { Compiler } from '@teambit/compiler';
// import type { BuildTask } from '@teambit/builder';
// import type { SchemaExtractor } from '@teambit/schema';
// import type { WebpackConfigTransformer } from '@teambit/webpack';
// import type { PackageJsonProps } from '@teambit/pkg';
// import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
// import { ElementsWrapperContext } from '@teambit/elements';
// import type { Capsule } from '@teambit/isolator';
// import type { Component } from '@teambit/component';
// import { EnvPreviewConfig } from '@teambit/preview';

export interface ReactEnvInterface {
  compiler(): Compiler;

  tester(context: TesterContext): Tester;

  formatter(context: FormatterContext): Formatter;

  // schema(): SchemaExtractor;

  linter(context: LinterContext): Linter;

  // preview(): Preview;
}
