import React from 'react';

export function SsrStyles() {
  return (
    <style id="before-hydrate-styles">
      .--ssr-hidden {'{'}
      display: none;
      {'}'}
    </style>
  );
}

export function removeSsrStyles() {
  document.getElementById('before-hydrate-styles')?.remove();
}
