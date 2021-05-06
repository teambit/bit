// style files regexps

// css
export const cssRegex = /\.css$/;
// css regex - will catch .css but not .module.css
export const cssNoModulesRegex = /(?<!\.module)\.css$/;
export const cssModuleRegex = /\.module\.css$/;

// sass | scss
export const sassRegex = /\.(scss|sass)$/;
// scss|sass regex - will catch .scss|sass but not .module.scss|sass
export const sassNoModuleRegex = /(?<!\.module)\.(scss|sass)$/;
export const sassModuleRegex = /\.module\.(scss|sass)$/;

// less
export const lessRegex = /\.less$/;
// less regex - will catch .less but not .module.less
export const lessNoModuleRegex = /(?<!\.module)\.less$/;
export const lessModuleRegex = /\.module\.less$/;
