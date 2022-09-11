import HtmlWebpackPlugin from 'html-webpack-plugin';
import insertStringAfter from 'insert-string-after';
import insertStringBefore from 'insert-string-before';

export type InjectHeadPluginOptions = {
  content: string;
  position?: 'start' | 'end';
};

/**
 * @typedef {Object} Options
 * @prop {string} content
 * @prop {string} position
 */
/**
 * @class
 */
export default class InjectHeadPlugin {
  /**
   * @constructor
   * @param {Options} [options] Plugin options
   */
  constructor(private options) {
    this.options = {
      content: '<div id=root/>',
      position: 'start',
      ...options,
    };
  }

  /**
   * @param {import("webpack").Compiler} compiler
   */
  apply(compiler) {
    compiler.hooks.compilation.tap('InjectHeadPluginOptions', (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tap('InjectHeadPluginOptions', (data) => {
        if (this.options.position === 'end') {
          // @ts-ignore
          data.html = insertStringBefore(data.html, '</head>', this.options.content);
        } else {
          // @ts-ignore
          data.html = insertStringAfter(data.html, '<head>', this.options.content);
        }
        return data;
      });
    });
  }
}
