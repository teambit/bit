import React from 'react';

export const mountId = 'tooltip-mount-point';

/** mounts the tooltip at a predefined location in the dom. Falls back to parent and then to body */
export function getMountPoint(ref: Element) {
  return document.getElementById(mountId) || ref.parentElement || document.body;
}

export function TooltipMountPoint() {
  return <div id={mountId} />;
}
