import React from 'react';
import ReactDOM from 'react-dom';

// let docs = [];

export function addDocs(docs: any[]) {
  const Doc = docs[0];
  ReactDOM.render(<Doc />, document.getElementById('root'));
}
