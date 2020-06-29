import React from 'react';
import ReactDOM from 'react-dom';
import { Base } from './base';

export default (docs: any) => {
  ReactDOM.render(<Base docs={docs} />, document.getElementById('root'));
};
