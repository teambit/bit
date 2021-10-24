import React from 'react';

const CustomImg = (
    <img
      style={{ width: 16, marginRight: 8 }}
      src="https://bitsrc.imgix.net/bf5970b9b97dfb045867dd2842eaefd1e623e328.png?size=35&w=70&h=70&crop=faces&fit=crop&bg=fff"
    />
  );

export const node = {
    id: 'composing',
    payload: {
      icon: 'workspace',
      title: 'Composing',
      path: '/docs/getting-started/composing/composing',
    },
    children: [
      {
        id: 'creating-components',
        payload: {
          title: 'Creating Components',
          path: '/docs/getting-started/composing/creating-components',
        },
      },
      {
        id: 'dev-environments',
        payload: {
          title: 'Dev environments',
          path: '/docs/getting-started/composing/dev-environments',
        },
      },
      {
        id: 'use-dependencies',
        payload: {
          title: 'Use dependencies',
          path: '/docs/getting-started/composing/use-dependencies',
        },
      },
    ],
  }