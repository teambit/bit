/* eslint-disable no-alert */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Button } from './button';

export const BasicButton = () => {
  return <Button>click me</Button>;
};

/**
 * example of passing a JSX Element as a parameter
 */
// eslint-disable-next-line react/prop-types
export function Footer({ children = <BasicButton /> }) {
  return <Button>{children}</Button>;
}

export const ButtonWithCustomStyles = () => {
  return <Button style={{ background: 'red' }}>click me</Button>;
};

export const ButtonWithIcon = () => {
  return (
    <Button>
      {/* <Image src="https://static.bit.dev/bit-logo.svg" /> */}
      click me
    </Button>
  );
};

export const ButtonAsALink = () => {
  return <Button href="https://bit.dev">Bit</Button>;
};
