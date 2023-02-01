import { Layout, LayoutFeatures } from '@teambit/base-ui.surfaces.split-pane.layout';

import { Size } from './split-pane';
import { DragSnapshot } from './use-drag-tracker';

export function calcSplit(snapshot: DragSnapshot | undefined, layout: Layout, defaultSize: Size): [Size, Size] {
  let splitSize = calcPixels(snapshot, layout, defaultSize);

  // update values to match `flex-direction: *-reverse`
  if (layout.includes(LayoutFeatures.reverse)) {
    splitSize.reverse();
  }

  if (splitSize[0] === undefined || splitSize[1] === undefined) {
    splitSize = autoCalcComplementary(splitSize);
  }

  return splitSize;
}

/**
 *
 * cheks in case one of the sizes is undefined
 */
function autoCalcComplementary([a, b]: [Size, Size]): [Size, Size] {
  if (a === undefined && b === undefined) return [undefined, undefined];
  if (b === undefined) {
    return [a, calcComplemetSize(a)];
  }
  if (a === undefined) {
    return [calcComplemetSize(b), b];
  }

  return [a, b];
}

/**
 * @example
 * 20 -> calc(100% - 20px)
 * 20px -> calc(100% - 20px)
 * 20% -> 80%
 * '20' -> calc(100% - 20px)
 */
function calcComplemetSize(size: Size) {
  if (size === undefined) return undefined;
  if (typeof size === 'number') {
    return `calc(100% - ${size}px)`;
  }
  if (size.endsWith('px')) {
    return `calc(100% - ${size})`;
  }

  if (size.endsWith('%')) {
    const sizeAsNumber = +size.replace('%', '');
    if (Number.isNaN(sizeAsNumber)) return undefined;
    return `${100 - sizeAsNumber}%`; // check this works
  }

  if (!Number.isNaN(+size)) return `calc(100% - ${size}px)`;

  return undefined;
}

function calcPixels(snapshot: DragSnapshot | undefined, layout: Layout, defaultSize: Size): [Size, Size] {
  const { row, column, first, last } = LayoutFeatures;
  const features = new Set(layout.split(' '));

  // show only top, left
  if (features.has(first)) {
    return ['100%', '0%'];
  }

  // show only bottom, right
  if (features.has(last)) {
    return ['0%', '100%'];
  }

  // horizontal
  if (features.has(row)) {
    if (snapshot?.x === undefined) return calcDefaultSize(defaultSize);

    if (typeof defaultSize === 'string' && defaultSize.endsWith('%')) {
      return [`${(100 * snapshot.x) / snapshot.width}%`, undefined];
    }

    return [snapshot.x, undefined];
  }

  // vertical:
  if (features.has(column)) {
    if (snapshot?.y === undefined) return calcDefaultSize(defaultSize);

    if (typeof defaultSize === 'string' && defaultSize.endsWith('%')) {
      return [`${(100 * snapshot.y) / snapshot.height}%`, undefined];
    }

    return [snapshot.y, undefined];
  }

  return [undefined, undefined];
}

/**
 * handles negative syntax (e.g. size="-200px")
 * @example "-200" -> [undefined, "200px"]
 * "-200px" -> [undefined, "200px"]
 * "200px" -> ["200px", undefined]
 * "100%" -> ["100%", undefined]
 * 100 -> [100, undefined]
 * -50 -> [undefined, 50]
 *
 */
function calcDefaultSize(defaultSize: Size): [Size, Size] {
  if (!defaultSize) return [undefined, undefined];

  if (typeof defaultSize === 'number' && defaultSize < 0) {
    return [undefined, -defaultSize];
  }
  if (typeof defaultSize === 'string' && defaultSize.startsWith('-')) {
    return [undefined, defaultSize.substring(1)];
  }

  return [defaultSize, undefined];
}
