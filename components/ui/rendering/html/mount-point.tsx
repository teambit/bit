import React, { ReactNode } from 'react';

export const mountPointId = 'root';
const placeholderRegex = /<div id="root"><\/div>/;

export function MountPoint({ children }: { children?: ReactNode }) {
  return <div id={mountPointId}>{children}</div>;
}

export function fillMountPoint(htmlTemplate: string, content: string) {
  const filled = htmlTemplate.replace(placeholderRegex, content);
  return filled;
}
