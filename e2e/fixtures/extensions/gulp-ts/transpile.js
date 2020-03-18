console.log(process.cwd());
const gulp = require('gulp');
const ts = require('gulp-typescript');
const typescript = require('typescript');
const merge = require('merge2');
const tsconfig = require('./default-tsconfig');

function transpile() {
  const tsProject = ts.createProject(tsconfig);

  gulp.task('default', () => {
    const tsResult = gulp.src(['*.ts', '*.tsx']).pipe(tsProject());

    return merge([tsResult.dts.pipe(gulp.dest('dist')), tsResult.js.pipe(gulp.dest('dist'))]);
  });

  gulp.series('default')(err => {
    if (err) console.error(err);
  });
  return { dir: 'dist' };
}

module.exports = transpile;
