const gulp = require('gulp');
const eslint = require('gulp-eslint');

module.exports = () => gulp
  .src([
    './src/**/*.js',
    './specs/**/*.js',
    './tasks/**/*.js'
  ])
  .pipe(eslint())
  .pipe(eslint.format());
