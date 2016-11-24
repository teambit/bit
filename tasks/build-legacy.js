const gulp = require('gulp');
const newer = require('gulp-newer');
const babel = require('gulp-babel');
const fs = require('fs');
const path = require('path'); 
const sourceMaps = require('gulp-sourcemaps')

const babelRc = JSON.parse(fs.readFileSync(path.resolve('.babelrc')), 'utf8');

module.exports = () => gulp
  .src([
    './src/**/*.js'
  ])
  .pipe(newer('dist-legacy'))
  .pipe(babel(babelRc.env.node4))
  .pipe(gulp.dest('dist-legacy'));
