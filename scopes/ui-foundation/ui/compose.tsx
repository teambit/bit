import React, { ReactNode } from 'react';

interface Props {
  /** Compose these components */
  components: Array<React.JSXElementConstructor<React.PropsWithChildren<any>>>;
  children?: ReactNode;
  /** pass props to component at render time */
  forwardProps?: any[];
}

/**
 * A react Component composer. equivalent to (n+1) => <a[n+1]> <Compose(n) /> </a[n+1]>
 */
export function Compose(props: Props) {
  const { components = [], forwardProps = [], children } = props;

  return (
    <>
      {components.reduceRight((acc, Comp, idx) => {
        return <Comp {...forwardProps[idx]}>{acc}</Comp>;
      }, children)}
    </>
  );
}
