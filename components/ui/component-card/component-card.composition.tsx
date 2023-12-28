import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ComponentCard } from './component-card';
import { componentMock } from './component-card.mocks';

export const BasicComponentCard = () => {
  return (
    <ThemeCompositions>
      <ComponentCard data-testid="basic-component-card" component={componentMock} />
    </ThemeCompositions>
  );
};

export const ComponentCardWithPlugins = () => {
  const plugins = [
    {
      bottomRight: [
        ({ component }) => {
          return (
            <img
              alt={`bottom-right-image-${component.id.name}`}
              src="https://static.bit.dev/extensions-icons/react.svg"
            />
          );
        },
      ],
      bottomLeft: [
        ({ component }) => {
          return (
            <img
              style={{ width: 16 }}
              alt={`bottom-left-image-${component.id.name}`}
              src="https://static.bit.dev/bit-logo.svg"
            />
          );
        },
      ],
    },
  ];
  return (
    <ThemeCompositions>
      <ComponentCard
        plugins={[...plugins, previewPlugin]}
        data-testid="component-card-with-plugins"
        component={componentMock}
      />
    </ThemeCompositions>
  );
};

export const ComponentCardWithMultiplePreviews = () => {
  const plugins = {
    preview: ({ component }) => (
      <img alt={`bottom-right-image-${component.id.name}`} src="https://static.bit.dev/extensions-icons/react.svg" />
    ),
  };
  return (
    <ThemeCompositions>
      <ComponentCard
        plugins={[plugins, previewPlugin]}
        data-testid="component-card-with-multiple-previews"
        component={componentMock}
      />
    </ThemeCompositions>
  );
};

export const ComponentCardWithTopPlugins = () => {
  const plugins = [
    {
      topRight: [
        ({ component }) => {
          return (
            <img alt={`top-right-image-${component.id.name}`} src="https://static.bit.dev/extensions-icons/react.svg" />
          );
        },
      ],
      topLeft: [
        ({ component }) => {
          return (
            <img
              style={{ width: 16 }}
              alt={`top-left-image-${component.id.name}`}
              src="https://static.bit.dev/bit-logo.svg"
            />
          );
        },
      ],
    },
  ];
  return (
    <ThemeCompositions>
      <ComponentCard plugins={plugins} data-testid="component-card-with-top-plugins" component={componentMock} />
    </ThemeCompositions>
  );
};

const previewPlugin = {
  preview: ({ component }) => (
    <img
      style={{ width: '100%', height: '100%' }}
      alt={`preview-image-${component.id.name}`}
      src="https://storage.googleapis.com/static.bit.dev/Community/app-components/homepage.jpg"
    />
  ),
};
