// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { render } from 'ink';
import { ExampleCMD } from './example.cmd';
import { HelpProps, DefaultHelpRender } from './help.cmd';

describe('example', function() {
  it('should render', function() {
    // const example = new ExampleCMD()
    const { unmount } = render(<ExampleCMD></ExampleCMD>);
    unmount();
  });

  it('should render funcitonal component', async () => {
    const props: HelpProps = {
      someName: {
        commands: { someCommand: 'test command' },
        description: ''
      }
    };
    const { unmount } = render(<DefaultHelpRender {...props} />);
    unmount();
  });
});
