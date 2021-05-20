import { getOptions } from 'loader-utils';
import { compile } from '@teambit/mdx.modules.mdx-compiler';

/**
 * bit-mdx webpack loader.
 * this loader allows compilation of Bit flavoured MDX in webpack.
 * @see http://bit.dev/teambit/mdx/modules/compiler for more information re Bit-flavour MDX compilation.
 */
export async function mdxLoader(content: string) {
  // @ts-ignore
  const callback = this.async();
  // @ts-ignore
  const options = Object.assign({}, getOptions(this), {
    // @ts-ignore
    filepath: this.resourcePath,
  });

  try {
    const output = await compile(content, options);
    return callback(null, output.contents);
  } catch (err) {
    return callback(err, null);
  }
}
