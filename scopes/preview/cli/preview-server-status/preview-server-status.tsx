import React from 'react';
// TODO: refactor ComponentServer from bundler to Preview.
import { ComponentServer } from '@teambit/bundler';
import { PreviewServerHeader } from './preview-server-header';
import { PreviewServerRow } from './preview-server-row';

export type PreviewServerStatusProps = {
  previewServers: ComponentServer[];
};

export function PreviewServerStatus({ previewServers }: PreviewServerStatusProps) {
  return (
    <>
      <PreviewServerHeader />
      {previewServers.map((server, key) => {
        return <PreviewServerRow key={key} previewServer={server}></PreviewServerRow>;
      })}
    </>
  );
}
