import React, { useEffect, useLayoutEffect, useRef } from 'react';
import classnames from 'classnames';
import { useFloating, autoUpdate, offset, size, shift } from '@floating-ui/react-dom';
import type { Coords } from '@floating-ui/react-dom';

import classStyles from './frame.module.scss';

/** frame padding around the target */
const MARGIN_FROM_TARGET = +classStyles.offset;
/** min. distance from the edge of the screen. Kept for syncing */
const MARGIN_FROM_DOC_EDGE = 0;

export interface FrameProps extends React.HTMLAttributes<HTMLDivElement> {
  targetElement: HTMLElement | null;
  stylesClass?: string;
  /** continually update frame position to match moving elements */
  watchMotion?: boolean;
}

// position - bottom start (bottom left corner)
// x - width - horizontal (cross axis)
// y - height - vertical (main axis)

export function Frame({
  targetElement,
  watchMotion,
  className,
  stylesClass = classStyles.overlayBorder,
  style,
}: FrameProps) {
  const dimensionRef = useRef({ width: 0, height: 0 });
  const shiftRef = useRef<Coords | undefined>();

  const { x, y, strategy, reference, floating, update, refs } = useFloating({
    placement: 'bottom-start',
    middleware: [
      // reposition x,y, to the top of the reference
      offset((options) => -options.reference.height),
      // offset the frame by its extra padding
      offset(() => ({ mainAxis: -MARGIN_FROM_TARGET, crossAxis: -MARGIN_FROM_TARGET })),
      // push the frame inside the screen
      shift({ rootBoundary: 'document', padding: MARGIN_FROM_DOC_EDGE, mainAxis: true, crossAxis: true }),
      // read "shift" for the size-apply() method (because it doesn't forward middlewareData)
      {
        name: 'read-shift',
        fn({ middlewareData }) {
          shiftRef.current = middlewareData.shift;
          return {};
        },
      },
      // size also applies overflow detection via width and height
      size({
        // apply overflow detection in reference to the document
        rootBoundary: 'document',
        padding: MARGIN_FROM_DOC_EDGE,
        apply({ reference: referenceRect, height, width }) {
          const paddingX = 2 * MARGIN_FROM_TARGET - (shiftRef.current?.x || 0);
          const paddingY = 2 * MARGIN_FROM_TARGET - (shiftRef.current?.y || 0);

          dimensionRef.current = {
            width: Math.min(referenceRect.width + paddingX, width),
            height: Math.min(referenceRect.height + paddingY, height),
          };
          Object.assign(refs.floating.current?.style, dimensionRef.current);
        },
      }),
    ],
  });

  // set target as floating reference
  useLayoutEffect(() => {
    reference(targetElement);
  }, [targetElement]);

  // automatically update on scroll, resize, etc.
  // `watchMotion` will trigger continuous updates using animation frame
  useEffect(() => {
    if (!refs.reference.current || !refs.floating.current) return () => {};

    return autoUpdate(refs.reference.current, refs.floating.current, update, { animationFrame: watchMotion });
  }, [refs.reference.current, refs.floating.current, update, watchMotion]);

  if (!targetElement) return null;

  return (
    <div
      ref={floating}
      className={classnames(className, stylesClass)}
      style={{
        ...style,
        ...dimensionRef.current,
        position: strategy,
        top: y ?? '',
        left: x ?? '',
      }}
    />
  );
}
