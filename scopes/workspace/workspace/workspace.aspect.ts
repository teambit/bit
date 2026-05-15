import { Aspect } from '../../harmony/harmony/aspect';

export const WorkspaceAspect = Aspect.create({
  id: 'teambit.workspace/workspace',
  runtimes: {
    main: () => import('./workspace.main.runtime'),
    ui: () => import('./workspace.ui.runtime'),
  },
});

export default WorkspaceAspect;
