'use strict';

var gulp   = require('gulp');
var jshint = require('gulp-jshint');
var jscs = require('gulp-jscs');
var jscsStylish = require('gulp-jscs-stylish');
var htmlhint = require('gulp-htmlhint');
var gutil = require('gulp-util');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var _ = require('lodash');
var sourcemaps = require('gulp-sourcemaps');
var streamify = require('gulp-streamify');
var uglify = require('gulp-uglify');
var htmlmin = require('gulp-htmlmin');
var minifyCSS = require('gulp-minify-css');
var imagemin = require('gulp-imagemin');
var pngquant = require('imagemin-pngquant');

var debug = process.env.DEBUG || false;

var paths = {
  js: 'app/scripts/**.js',
  html: 'app/**.html'
};

// error handling, simplified version (without level) from
// http://www.artandlogic.com/blog/2014/05/error-handling-in-gulp/
function handleError(error) {
  gutil.log(error);
  process.exit(1);
}

// bundle js files + dependencies with browserify
// // (and continue to do so on updates)
// // see
// https://github.com/gulpjs/gulp/blob/master/docs/recipes/fast-browserify-builds-with-watchify.md
function js(watch) {
  var browserify = require('browserify');
  //var shim = require('browserify-shim');
  var watchify = require('watchify');

  var browserifyArgs = _.extend(watchify.args, {debug: true});
  var bundler = browserify('./src/scripts/background.js', browserifyArgs);

  //// use shims defined in package.json via 'browser' and 'browserify-shim'
  //// properties
  //bundler.transform(shim);

  // register watchify
  if (watch) {
    bundler = watchify(bundler);
  }

  function rebundle () {
    return bundler.bundle()
      .on('error', handleError)
      .pipe(source('background.js'))
      .pipe(buffer())
      .pipe(sourcemaps.init({loadMaps: true}))
        .pipe(debug ? gutil.noop() : streamify(uglify()))
      .pipe(sourcemaps.write('./'))
      .pipe(gulp.dest('build/scripts/'));
  }
  bundler.on('update', rebundle);

  return rebundle();
}

// bundle once
gulp.task('scripts', ['jshint', 'jscs'], function() {
  return js(false);
});

var imageminOpts = {
  progressive: true,
  svgoPlugins: [{removeViewBox: false}],
  use: [pngquant()]
};
gulp.task('images', function() {
  return gulp.src('src/images/**')
  .pipe(imagemin(imageminOpts))
  .pipe(gulp.dest('build/images'));
});

// copy static folders to build directory
gulp.task('static', ['images'], function() {
  gulp.src('src/_locales/**')
  .pipe(gulp.dest('build/_locales'));
  return gulp.src('src/manifest.json')
  .pipe(gulp.dest('build'));
});

gulp.task('jshint', function() {
  return gulp.src(paths.js)
  .pipe(jshint())
  .pipe(jshint.reporter('default'));
});

gulp.task('jscs', function() {
  return gulp.src(paths.js)
  .pipe(jscs())
  .pipe(jscsStylish());  // log style errors
});

var htmlhintOpts = {
  'doctype-first': false
};
gulp.task('htmlhint', function() {
  return gulp.src(paths.html)
  .pipe(htmlhint(htmlhintOpts))
  .pipe(htmlhint.reporter())
  .pipe(htmlhint.failReporter());
});

var htmlminOpts = {
  collapseWhitespace: true,
  removeComments: true
};
// copy and compress HTML files
gulp.task('html', ['htmlhint'], function() {
  return gulp.src('src/*.html')
  .pipe(debug ? gutil.noop() : htmlmin(htmlminOpts))
  .pipe(gulp.dest('build'));
});

// minify styles
var minifyCssOpts = {
  'restructuring': false
};
gulp.task('styles', function() {
  return gulp.src('src/styles/**/*.css')
  .pipe(debug ? gutil.noop() : minifyCSS(minifyCssOpts))
  .pipe(gulp.dest('build/styles'));
  //return gulp.src('src/styles/**')
  //.pipe(gulp.dest('build/styles'));
});

gulp.task('clean', function(cb) {
  var del = require('del');
  del(['build/*'], cb);
  //del(['dist/*'], cb);
});

gulp.task(
  'default',
  ['html', 'styles', 'static', 'scripts']
);
