import type { EnvHandler } from './env-handler';
import type { Compiler } from './compiler';
import type { Tester } from './tester';
import type { Linter } from './linter';
import type { Formatter } from './formatter';
import type { PackageGenerator } from './package-generator';
import type { TemplateList } from './template-list';
import type { StarterList } from './starter-list';
import type { SchemaExtractor } from './schema';
import type { Preview } from './preview';
import type { ConfigWriterList } from './config-writer-list';
import type { AppTypeList } from './application';

/**
 * an env. each service the env provides is a method that returns an env handler.
 */
export interface Env {
  [key: string]: EnvHandler<unknown> | any;
}

export interface CompilerEnv {
  compiler(): EnvHandler<Compiler>;
}

export interface TesterEnv {
  tester(): EnvHandler<Tester>;
}

export interface LinterEnv {
  linter(): EnvHandler<Linter>;
}

export interface FormatterEnv {
  formatter(): EnvHandler<Formatter>;
}

export interface PackageEnv {
  package(): EnvHandler<PackageGenerator>;
}

export interface GeneratorEnv {
  generators(): EnvHandler<TemplateList>;
  starters(): EnvHandler<StarterList>;
}

export interface SchemaEnv {
  schemaExtractor(): EnvHandler<SchemaExtractor>;
}

export interface PreviewEnv {
  preview(): EnvHandler<Preview>;
}

export interface WorkspaceConfigEnv {
  workspaceConfig?(): ConfigWriterList;
}

export interface AppsEnv {
  apps?(): EnvHandler<AppTypeList>;
}
