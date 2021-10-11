import React from 'react';
import { isNumber } from './is-number';

export const StringIsNotNumber = () => {
  return <div>{`isNumber('foo') => ${isNumber('foo').toString()}`}</div>;
};

export const NumberIsNumber = () => {
  return <div>{`isNumber(1) => ${isNumber(1).toString()}`}</div>;
};
