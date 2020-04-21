import { IsolatorExt } from '../isolator';
import componentProvider from './component.provider';

export default {
  name: 'ComponentFactory',
  dependencies: [IsolatorExt],
  provider: componentProvider
};
