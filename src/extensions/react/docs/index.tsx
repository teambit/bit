import React from 'react';
import ReactDOM from 'react-dom';
import { Base } from './base';

// this is the placeholder data for the query data
const queryData = {};

export default (docs: any) => {
  ReactDOM.render(<Base docs={docs} query={queryData} />, document.getElementById('root'));
};
