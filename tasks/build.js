const gulp = require('gulp');
const newer = require('gulp-newer');
const babel = require('gulp-babel');
const fs = require('fs');
const path = require('path'); 
const sourceMaps = require('gulp-sourcemaps')

module.exports = () => gulp
  .src([
    './src/**/*.js'
  ])
  .pipe(newer('dist'))
  .pipe(babel())
  .pipe(gulp.dest('dist'));
