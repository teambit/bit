const gulp = require('gulp');
const clean = require('gulp-clean');

module.exports = () => gulp
  .src([
      './dist'
  ])
  .pipe(clean())
