import React from 'react';
import { Ellipsis } from './index';

const longName = "This is a really long name so you'll see the ellipsis";
const shortName = 'Short';

export const LongString = () => {
  return <Ellipsis style={{ width: 100 }}>{longName}</Ellipsis>;
};

export const ShortString = () => {
  return <Ellipsis style={{ width: 100 }}>{shortName}</Ellipsis>;
};
