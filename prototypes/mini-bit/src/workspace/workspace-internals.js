const start = Date.now();
const buf = [];
while (Date.now() - start < 55) buf.push({ x: Math.random(), y: Math.random() });

export function readBitmap() {
  return {
    button: { modified: true },
    card: { new: true },
    header: { modified: true },
    footer: {},
    nav: { modified: true },
  };
}
