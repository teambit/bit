import workspaceProvider from './workspace.provider';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';
import { PaperExt } from '../paper';
import { CapsuleExt } from '../../capsule';

export default {
  name: 'workspace',
  dependencies: [ScopeExt, ComponentFactoryExt, PaperExt, CapsuleExt],
  config: {
    /**
     * set the default structure of components in your project.
     */
    defaultScope: '',

    /**
     * default scope for components to be exported to. absolute require paths for components
     * will be generated accordingly.
     */
    components: 'components/{name}'
  },
  provider: workspaceProvider
};
