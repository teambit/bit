import React from 'react';
import ReactDOM from 'react-dom';
import { Base } from './base';

export default (Provider: React.ComponentType, componentId: string, docs: any, compositions: any) => {
  ReactDOM.render(
    <Main compositions={compositions} Provider={Provider} docs={docs} componentId={componentId} />,
    document.getElementById('root')
  );
};

type MainProps = {
  Provider: React.ComponentType;
  docs: any;
  componentId: string;
  compositions: [React.ComponentType];
};

function Main({ Provider, docs, componentId, compositions }: MainProps) {
  return (
    <Provider>
      <Base docs={docs} componentId={componentId} compositions={compositions} />
    </Provider>
  );
}
