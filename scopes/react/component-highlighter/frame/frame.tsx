import React, { useEffect, useLayoutEffect, useRef, RefObject } from 'react';
import classnames from 'classnames';
import { useFloating, autoUpdate, offset, size, shift } from '@floating-ui/react-dom';
import type { Coords } from '@floating-ui/react-dom';

import styles from './frame.module.scss';

/** frame padding around the target */
const MARGIN_FROM_TARGET = +styles.offset || 6; // setting fallback 6, for tests
/** min. distance from the edge of the screen. */
const MARGIN_FROM_DOC_EDGE = 0;

export interface FrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** apply the frame to this element  */
  targetRef: RefObject<HTMLElement | null>;
  /**
   * the specific flavor of the frame.
   * @default "redBorderClass"
   */
  stylesClass?: string;
  /** continually update frame position to match moving elements */
  watchMotion?: boolean;
}

// position - bottom start (bottom left corner)
// x - width - horizontal (cross axis)
// y - height - vertical (main axis)

export function Frame({ targetRef, watchMotion, className, stylesClass = styles.overlayBorder, style }: FrameProps) {
  const dimensionRef = useRef({ width: 0, height: 0 });
  const shiftRef = useRef<Coords | undefined>();

  const { x, y, strategy, reference, floating, update, refs } = useFloating({
    placement: 'bottom-start',
    middleware: [
      // replace dimensions from previous iterations with the target's size
      // this is only the measured size, not yet the applied size
      {
        name: 'align-to-target',
        fn({ rects }) {
          rects.floating = {
            ...rects.floating,
            width: rects.reference.width + 2 * MARGIN_FROM_TARGET,
            height: rects.reference.height + 2 * MARGIN_FROM_TARGET,
          };

          return {};
        },
      },
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
    reference(targetRef.current);
  }, [targetRef.current]);

  // automatically update on scroll, resize, etc.
  // `watchMotion` will trigger continuous updates using animation frame
  useEffect(() => {
    if (!refs.reference.current || !refs.floating.current) return () => {};

    return autoUpdate(refs.reference.current, refs.floating.current, update, { animationFrame: watchMotion });
  }, [refs.reference.current, refs.floating.current, update, watchMotion]);

  const isReady = x !== null;

  return (
    <div
      ref={floating}
      className={classnames(className, stylesClass, !isReady && styles.hidden)}
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
