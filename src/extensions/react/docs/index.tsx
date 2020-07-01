import React from 'react';
import ReactDOM from 'react-dom';
import { Base } from './base';
import { ClientContext } from './client-context';

// this is the placeholder data for the query data
const queryData = {};

export default (docs: any) => {
  ReactDOM.render(
    <ClientContext>
      <Base docs={docs} query={queryData} />
    </ClientContext>,
    document.getElementById('root')
  );
};
