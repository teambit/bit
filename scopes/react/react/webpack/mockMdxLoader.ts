export default async function mdxLoader() {
  // @ts-ignore
  const callback = this.async();
  // @ts-ignore
  // const options = Object.assign({}, getOptions(this), {
  //   // @ts-ignore
  //   filepath: this.resourcePath,
  // });

  try {
    const output = await Promise.resolve("const LOADER_TEST = 'MDX_LOADER';");
    return callback(null, output);
  } catch (err: any) {
    return callback(err, null);
  }
}
