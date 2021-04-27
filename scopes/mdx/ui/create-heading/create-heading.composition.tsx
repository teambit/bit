import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { createHeading } from './create-heading';

export const CreateH1Example = () => {
  const Heading = createHeading('lg');
  return (
    <ThemeCompositions>
      <Heading data-testid="test-create-heading">H1 size</Heading>
    </ThemeCompositions>
  );
};

export const CreateH2Example = () => {
  const Heading = createHeading('md');
  return (
    <ThemeCompositions>
      <Heading data-testid="test-create-heading">H2 size</Heading>
    </ThemeCompositions>
  );
};

export const CreateH3Example = () => {
  const Heading = createHeading('sm');
  return (
    <ThemeCompositions>
      <Heading data-testid="test-create-heading">H3 size</Heading>
    </ThemeCompositions>
  );
};

export const CreateH4Example = () => {
  const Heading = createHeading('xs');
  return (
    <ThemeCompositions>
      <Heading data-testid="test-create-heading">H4 size</Heading>
    </ThemeCompositions>
  );
};

export const CreateH5Example = () => {
  const Heading = createHeading('xxs');
  return (
    <ThemeCompositions>
      <Heading data-testid="test-create-heading">H5 size</Heading>
    </ThemeCompositions>
  );
};

export const CreateH6Example = () => {
  const Heading = createHeading('xxs');
  return (
    <ThemeCompositions>
      <Heading data-testid="test-create-heading">H6 size</Heading>
    </ThemeCompositions>
  );
};
