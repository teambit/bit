import React from 'react';
// import {Command} from '../command'
import { Color } from 'ink';

export class ExampleCMD extends React.Component {
  name: 'yo';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(num: number) {
    // eslint-disable-next-line no-plusplus
    return (
      <Color green>
        <div>Hello World {++num}</div>
      </Color>
    );
  }
}
