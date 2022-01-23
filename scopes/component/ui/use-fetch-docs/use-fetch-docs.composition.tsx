import React from 'react';
import { useFetchDocs } from './use-fetch-docs';

export const BasicuseFetchDocs = () => {
  const { count, increment } = useFetchDocs();

  return (
    <>
      <h1>The count is {count}</h1>
      <button onClick={increment}>increment</button>
    </>
  );
};
