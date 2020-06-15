import React from 'react';
// import {Command} from '../command'
import { Color } from 'ink';

// should implement command but it doesn't extend react component
export class ExampleCMD extends React.Component {
  name: 'yo';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(num: number) {
    return (
      <Color green>
        {/* eslint-disable-next-line no-plusplus */}
        <div>Hello World {++num}</div>
      </Color>
    );
  }
}
