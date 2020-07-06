import React from 'react';
import { LiveProvider, LiveEditor, LiveError, LivePreview } from 'react-live';

export type PlaygroundProps = {
  code: string;
  scope: { [key: string]: any };
};

export function Playground({ code, scope }: PlaygroundProps) {
  return (
    <LiveProvider code={code} scope={scope}>
      <LiveEditor />
      <LiveError />
      <LivePreview />
    </LiveProvider>
  );
}
