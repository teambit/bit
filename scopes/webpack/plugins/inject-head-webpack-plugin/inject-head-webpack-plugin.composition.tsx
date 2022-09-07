import React from 'react';
import { injectHeadWebpackPlugin } from './inject-head-webpack-plugin';

export function ReturnsCorrectValue() {
  return <div>{injectHeadWebpackPlugin()}</div>;
}
