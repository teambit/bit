import { ComponentID } from '@teambit/component-id';
import { ComponentDescriptor, AspectList } from '@teambit/component-descriptor';

const id = ComponentID.fromString('teambit.graphql/contexts/graphql-provider@0.0.1');

const snapId = ComponentID.fromString(
  'teambit.graphql/contexts/graphql-provider@90BA8E42F0820B22E76E477624FB2AAA16B125CAA144D94BECA223324DA54733'
);

const aspect = new AspectList([
  {
    aspectId: 'teambit.components/aspects/components-env',
    aspectData: {
      id: 'teambit.community/envs/community-react@1.23.1',
      icon: 'https://static.bit.dev/extensions-icons/react.svg',
    },
  },
  {
    aspectId: 'teambit.docs/docs',
    aspectData: {
      id: 'teambit.docs/docs',
      icon: 'https://static.bit.dev/extensions-icons/default.svg',
      data: {
        doc: {
          filePath: 'component-card-display.docs.mdx',
          props: [
            {
              name: 'description',
              value: "A component that accepts an array of component id's and renders a grid with component cards",
            },
            {
              name: 'labels',
              value: ['react', 'ui', 'grid', 'component card'],
            },
          ],
        },
      },
    },
    // },
  },
]);

export const componentMock = new ComponentDescriptor(id as any, aspect);

export const componentSnapMock = new ComponentDescriptor(snapId as any, aspect);
