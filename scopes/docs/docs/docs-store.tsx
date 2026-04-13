import React from 'react';
import { createRoot } from 'react-dom/client';

let root;

export function addDocs(docs: any[]) {
  const Doc = docs[0];
  if (!root) {
    root = createRoot(document.getElementById('root')!);
  }
  root.render(<Doc />);
}
