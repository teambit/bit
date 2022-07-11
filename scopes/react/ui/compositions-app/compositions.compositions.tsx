import React from 'react';
import { CompositionsApp } from './compositions-app';

const mockedComposition = () => <div>mocked composition</div>;
// const mockedErrorComposition = () => {
//   throw new Error('some generic error');
// };

export const Preview = () => {
  return <CompositionsApp Composition={mockedComposition} />;
};

export const NotFound = () => {
  return <CompositionsApp Composition={undefined} />;
};

// // TBD - automatically shows a large error message in dev mode
// export const ErrorComposition = () => {
//   return <CompositionsApp Composition={mockedErrorComposition} />;
// };
