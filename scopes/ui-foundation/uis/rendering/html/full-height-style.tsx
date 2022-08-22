import React from 'react';

export function FullHeightStyle() {
  // return <style> {'html { height: 100%; } body { margin: 0; height: 100%; } #root { height: 100%; }'} </style>;
  return <style>{'body { margin: 0; width: fit-content; }'}</style>;
}
