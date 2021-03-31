import React from 'react';
import { render } from '@testing-library/react';
import { domToFiber } from './dom-to-fiber';

describe('domToFiber', () => {
  it('should find fiberNode for simple component', () => {
    const { getByText } = render(<DivComponent />);
    const target = getByText('hello');

    const fiberNode = domToFiber(target);
    expect(fiberNode).not.toBeNull();
    expect(fiberNode?.memoizedProps).toEqual({ children: 'hello' });
    expect(fiberNode?.type).toEqual('div');
  });

  it('should find fiberNode when in fragment', () => {
    const { getByText } = render(<FragmentComponent />);
    const target = getByText('hello');

    const fiberNode = domToFiber(target);
    expect(fiberNode).not.toBeNull();
    expect(fiberNode?.memoizedProps).toEqual({ children: 'hello' });
    expect(fiberNode?.type).toEqual('div');
  });

  it('should find fiberNode when in array', () => {
    const { getByText } = render(<ArrayComponent />);
    const target = getByText('hello');

    const fiberNode = domToFiber(target);
    expect(fiberNode).not.toBeNull();
    expect(fiberNode?.memoizedProps).toEqual({ children: 'hello' });
    expect(fiberNode?.type).toEqual('div');
  });

  it('should find fiberNode with when nested', () => {
    const { getByText } = render(<NestedComponent />);
    const target = getByText('hello');

    const fiberNode = domToFiber(target);
    expect(fiberNode).not.toBeNull();
    expect(fiberNode?.memoizedProps).toEqual({ children: 'hello' });
    expect(fiberNode?.type).toEqual('div');
  });

  // // not working for text fragments. 🤷
  // it.skip('should find fiberNode for Fragment component', () => {
  //   const { getByText } = render(<>hello</>);
  //   const target = getByText('hello');

  //   const fiberNode = domToFiber(target);
  //   expect(fiberNode).not.toBeNull();
  //   expect(fiberNode?.memoizedProps).toEqual({ children: 'hello' });
  //   expect(fiberNode?.type).toEqual('div');
  // });
});

function DivComponent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>hello</div>;
}

function FragmentComponent(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <>
      <div {...props}>hello</div>
      <div {...props}>world</div>
    </>
  );
}

function NestedComponent(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props}>
      container
      <div>
        <div>pre-sibling</div>
        contained
        <div>hello</div>
        <div>sibling</div>
      </div>
    </div>
  );
}

function ArrayComponent(props: React.HTMLAttributes<HTMLDivElement>) {
  const arr = ['hello', 'world'];

  return (
    <div {...props}>
      {arr.map((x) => (
        <div key={x}>{x}</div>
      ))}
    </div>
  );
}
