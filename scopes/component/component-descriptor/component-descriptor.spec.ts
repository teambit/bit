import { ComponentID } from '@teambit/component';
import { ComponentDescriptor } from './component-descriptor';
import { AspectList } from './aspect-list';

const MOCK_ID = 'teambit.components/hello-world';
const MOCK_ASPECT_MAP = AspectList.fromObject({
  entries: [
    {
      aspectId: 'teambit.docs/docs',
      aspectData: {},
    },
  ],
});

const MOCK_ASPECT_MAP_JSON = AspectList.fromJson({
  entries: [
    {
      aspectId: 'teambit.docs/docs',
      aspectData: '{}',
    },
  ],
});

describe('ComponentDescriptor', () => {
  it('should contain a component id', () => {
    const descriptor = new ComponentDescriptor(ComponentID.fromString(MOCK_ID), MOCK_ASPECT_MAP);
    expect(descriptor.id.scope).toEqual('teambit.components');
  });

  it('should contain a component id', () => {
    const descriptor = new ComponentDescriptor(ComponentID.fromString(MOCK_ID), MOCK_ASPECT_MAP_JSON);
    expect(descriptor.id.scope).toEqual('teambit.components');
  });
});
