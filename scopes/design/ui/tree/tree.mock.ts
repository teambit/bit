export const basicTreeMock = {
  id: 'basic tree layout',
  children: [
    {
      id: 'level1',
      children: [
        {
          id: 'level2',
          children: [
            {
              id: 'level3',
            },
          ],
        },
      ],
    },
  ],
};

export const treeMock = {
  id: '',
  children: [
    {
      id: 'teambit.community/',
      children: [
        {
          id: 'teambit.community/envs/',
          children: [
            {
              id: 'teambit.community/envs/community-react',
            },
          ],
        },
      ],
    },
    {
      id: 'teambit.components/',
      children: [
        {
          id: 'teambit.components/blocks/',
          children: [
            {
              id: 'teambit.components/blocks/component-card-display',
            },
          ],
        },
      ],
    },
    {
      id: 'teambit.explorer/',
      children: [
        {
          id: 'teambit.explorer/plugins/',
          children: [
            {
              id: 'teambit.explorer/plugins/env-plugin',
            },
          ],
        },
        {
          id: 'teambit.explorer/ui/',
          children: [
            {
              id: 'teambit.explorer/ui/component-card',
            },
            {
              id: 'teambit.explorer/ui/component-card-grid',
            },
          ],
        },
      ],
    },
  ],
};
