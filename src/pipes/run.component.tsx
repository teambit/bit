import React from 'react';

type RunProps = {
  name: string
}; 

export default function Run({ name }: RunProps) {
  return <h1>hi {name}</h1>;
}
