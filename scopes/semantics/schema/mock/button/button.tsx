/* eslint-disable import/no-unresolved */
import React, { ReactNode, useRef } from 'react';
// @ts-ignore
// import { useButton } from '@react-aria/button';
import { Link } from '@teambit/base-react.navigation.link';

export type ButtonElementType = 'a' | 'button';

export type ButtonProps = {
  /**
   * children of the Button.
   */
  children: ReactNode;

  /**
   * link to target page. once href is used, Button is considered an A tag.
   */
  href?: string;

  /**
   * class names to inject.
   */
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button(props: ButtonProps) {
  const ref = useRef();

  // const { buttonProps } = useButton(
  //   {
  //     ...props,
  //     elementType: props.href ? 'a' : undefined,
  //   },
  //   // @ts-ignore figure this out.
  //   ref
  // );

  const allProps = {
    // ...buttonProps,
    ...props,
  };
  const external = props.href?.startsWith('http:') || props.href?.startsWith('https:');

  return (
    <>
      {!props.href ? (
        // @ts-ignore
        <button className={props.className} ref={ref} {...allProps}>
          {props.children}
        </button>
      ) : (
        // @ts-ignore
        <Link external={external} ref={ref} className={props.className} {...allProps}>
          {props.children}
        </Link>
      )}
    </>
  );
}

export class Bar {
  foo() {}
}
