import React from 'react';
import { Tab } from './tab';

export const TabWithText = () => {
  return <Tab>bit</Tab>;
};

export const TabWithChildElement = () => {
  return (
    <Tab>
      <img alt="bit-logo" src="https://static.bit.dev/bit-logo.svg" />
    </Tab>
  );
};

export const ActiveTab = () => {
  return <Tab isActive>bit</Tab>;
};
