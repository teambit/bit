import React from 'react';
import ReactDOM from 'react-dom';

export default (Composition: React.ComponentType) => {
  ReactDOM.render(<Composition />, document.getElementById('root'));
};
