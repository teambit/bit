import { Extension } from '../../extensions/harmony';
import { provideScope } from './scope.provider';

export default Extension.instantiate({
  name: 'Scope',
  dependencies: [],
  config: {},
  provider: provideScope
});
