import React from 'react';
import { render } from '@testing-library/react';
import {
  BasicComponentCard,
  ComponentCardWithPlugins,
  ComponentCardWithMultiplePreviews,
  ComponentCardWithTopPlugins,
} from './component-card.composition';

it('should render basic card without plugins', () => {
  const { getByTestId } = render(<BasicComponentCard />);
  const rendered = getByTestId('basic-component-card');
  expect(rendered).toBeTruthy();
});

it('should render card with plugins', () => {
  const { getByTestId } = render(<ComponentCardWithPlugins />);
  const rendered = getByTestId('component-card-with-plugins');
  expect(rendered).toBeTruthy();
});

it('should render card with preview plugin and pass component data to it', () => {
  const { getByTestId, getByAltText } = render(<ComponentCardWithPlugins />);
  const rendered = getByTestId('component-card-with-plugins');
  const preview = getByAltText('preview-image-graphql-provider');
  expect(rendered).toContainElement(preview);
});
it('should render card with bottomRight plugin and pass component data to it', () => {
  const { getByTestId, getByAltText } = render(<ComponentCardWithPlugins />);
  const rendered = getByTestId('component-card-with-plugins');
  const preview = getByAltText('bottom-right-image-graphql-provider');
  expect(rendered).toContainElement(preview);
});
it('should render card with bottomLeft plugin and pass component data to it', () => {
  const { getByTestId, getByAltText } = render(<ComponentCardWithPlugins />);
  const rendered = getByTestId('component-card-with-plugins');
  const preview = getByAltText('bottom-left-image-graphql-provider');
  expect(rendered).toContainElement(preview);
});

it('should render card with the preview of the last plugin passed to it, if passed multiple previews', () => {
  const { getByTestId, getByAltText } = render(<ComponentCardWithMultiplePreviews />);
  const rendered = getByTestId('component-card-with-multiple-previews');
  const preview = getByAltText('preview-image-graphql-provider');
  expect(rendered).toContainElement(preview);
});

describe('component card with top plugins', () => {
  // it('should render top left plugin when passed', () => {
  //   const { getByTestId } = render(<ComponentCardWithTopPlugins />);
  //   const linkWrapper = getByTestId('component-card-link-wrapper');
  //   const componentCard = getByTestId('component-card-inside-of-link');
  //   expect(linkWrapper).toContainElement(componentCard);
  // });

  it('should render top right plugin when passed', () => {
    const { getByAltText, getByTestId } = render(<ComponentCardWithTopPlugins />);
    const rightPlugin = getByAltText('top-right-image-graphql-provider');
    const leftPlugin = getByAltText('top-left-image-graphql-provider');
    const component = getByTestId('component-card-with-top-plugins');
    expect(component).toContainElement(leftPlugin);
    expect(component).toContainElement(rightPlugin);
  });
});
