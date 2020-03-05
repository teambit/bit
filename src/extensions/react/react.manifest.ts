/* eslint-disable @typescript-eslint/no-unused-vars */
import { ExtensionManifest } from '../../harmony';
import { Flows, FlowsExt } from '../flows';

export const ReactExtension: ExtensionManifest = {
  name: 'react',
  dependencies: [FlowsExt],
  provider: async (config: {}, [flows]: [Flows]) => {}
};
