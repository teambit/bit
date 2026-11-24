/**
 * ids of the core aspects envs get from the env context, e.g.
 * `context.getAspect<Workspace>(WORKSPACE_ASPECT_ID)`. use these instead of importing the aspect
 * objects, which would make the env depend on the aspect packages.
 */
export const WORKSPACE_ASPECT_ID = 'teambit.workspace/workspace';
export const SCOPE_ASPECT_ID = 'teambit.scope/scope';
export const PUBSUB_ASPECT_ID = 'teambit.harmony/pubsub';
export const BUILDER_ASPECT_ID = 'teambit.pipelines/builder';
export const COMPILER_ASPECT_ID = 'teambit.compilation/compiler';
export const BUNDLER_ASPECT_ID = 'teambit.compilation/bundler';
export const TESTER_ASPECT_ID = 'teambit.defender/tester';
export const PKG_ASPECT_ID = 'teambit.pkg/pkg';
export const APPLICATION_ASPECT_ID = 'teambit.harmony/application';
export const DOCS_ASPECT_ID = 'teambit.docs/docs';
export const DEPENDENCY_RESOLVER_ASPECT_ID = 'teambit.dependencies/dependency-resolver';
export const DEV_FILES_ASPECT_ID = 'teambit.component/dev-files';
export const ISOLATOR_ASPECT_ID = 'teambit.component/isolator';
export const TYPESCRIPT_ASPECT_ID = 'teambit.typescript/typescript';
