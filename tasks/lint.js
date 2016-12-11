const gulp = require('gulp');
const eslint = require('gulp-eslint');
const flow = require('gulp-flowtype');

module.exports = () => gulp
  .src([
    './src/**/*.js',
    './specs/**/*.js'
  ])
  .pipe(eslint())
  .pipe(eslint.format());
