/* eslint-disable prefer-const */
/* eslint-disable react/prop-types */

// This is a clone of React Router's AnchorLink, which is otherwise not public.
// It was copied 'as is' from here:
// https://github.com/ReactTraining/react-router/blob/master/packages/react-router-dom/modules/Link.js

import React from 'react';

// React 15 compat
const forwardRefShim = (C) => C;
let { forwardRef } = React;
if (typeof forwardRef === 'undefined') {
  forwardRef = forwardRefShim;
}

function isModifiedEvent(event) {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

const LinkAnchor = forwardRef(
  (
    {
      innerRef, // TODO: deprecate
      navigate,
      onClick,
      ...rest
    },
    forwardedRef
  ) => {
    const { target } = rest;

    let props = {
      ...rest,
      onClick: (event) => {
        try {
          if (onClick) onClick(event);
        } catch (ex) {
          event.preventDefault();
          throw ex;
        }

        if (
          !event.defaultPrevented && // onClick prevented default
          event.button === 0 && // ignore everything but left clicks
          (!target || target === '_self') && // let browser handle "target=_blank" etc.
          !isModifiedEvent(event) // ignore clicks with modifier keys
        ) {
          event.preventDefault();
          navigate();
        }
      },
    };

    // React 15 compat
    if (forwardRefShim !== forwardRef) {
      props.ref = forwardedRef || innerRef;
    } else {
      props.ref = innerRef;
    }

    return <a {...props} />;
  }
);

LinkAnchor.displayName = 'LinkAnchor';

export { LinkAnchor };
