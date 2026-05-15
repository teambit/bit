import { Aspect } from '@teambit/core';

/**
 * Wires the workspace's `UIRoot` and GraphQL schema into the UI / bundler /
 * graphql aspects. Split out of `WorkspaceAspect` so CLI commands (status,
 * list, install, etc.) don't pull the UI / bundler / apollo dep chain just
 * to reach the `Workspace` instance. See RFC §6 — heavy DI deps that only
 * matter for `bit start` should not be on the CLI hot path.
 */
export const WorkspaceUiBinderAspect = Aspect.create({
  id: 'teambit.workspace/workspace-ui-binder',
  runtimes: { main: () => import('./workspace-ui-binder.main.runtime') },
});

export default WorkspaceUiBinderAspect;
