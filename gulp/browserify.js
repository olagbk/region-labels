var path = require('path');
var extend = require("node.extend");
var source = require('vinyl-source-stream');
var watchify = require('watchify');
var browserify = require('browserify');
var scssify = require('scssify');
var request = require('request');
var q = require('q');
var chalk = require('chalk-log');
var resolve = require('resolve-file');
var del = require('del');

//Detect production/development environment from system environment vars.
//Defaults to 'development'.
var environment = process.env.NODE_ENV || "development";

var npm_deps = require('../package.json').clientDependencies;

var make_bundle = function(opts){

    if(opts === undefined){
        opts = {};
    }

    if(opts.use_watchify === undefined){
        opts.use_watchify = (environment == "development");
    }

    if(opts.bsfy_opts === undefined){
        opts.bsfy_opts = {};
    }

    var prms_dirname = path.dirname(opts.out_file);
    var out_filename = (opts.out_file)? path.basename(opts.out_file) : path.basename(opts.bsfy_opts.entries);
    var out_dirname = (!opts.out_file || prms_dirname == '.')? 'app/dist' : prms_dirname;

    var bsfy_opts_common = {
        debug: (environment == "development"),
        paths: ["app"],
        cache: {},
        packageCache: {}
    };

    var bsfy_opts = extend(bsfy_opts_common, opts.bsfy_opts);

    var b = browserify(bsfy_opts);

    if(opts.require){
        for(key in opts.require){
            var npm_name = opts.require[key];
            var npm_path = resolve(npm_name);
            b.require(npm_path, {expose: npm_name});
        }
    }

    if(opts.external){
        for(key in opts.external){
            var npm_name = opts.external[key];
            b.external(npm_name);
        }
    }

    //b.plugin(row_flow().plugin());

    //b.transform(babelify);

    b.transform(scssify, {
        'auto-inject': true, // Inject css directly in the code
        sass: {
            sourceMapEmbed: (environment == 'development'),
            sourceMapContents: (environment == 'development')
        }
    });


    if(opts.use_watchify){
        b = watchify(b);
        b.on('update', rebundle);
    }

    function rebundle () {
        chalk.log("Bundling "+out_filename+"...");
        return b.bundle()
            .on('error', function (err) {
                //On bundler errors print out the message in red and then continue (don't want to break the watchers)
                chalk.error('Browserify Bundling ERROR: ' + err.message);
                this.emit('end');
            })
            .pipe(source(out_filename))
            .pipe(gulp.dest(out_dirname));
    }

    return rebundle();

};

gulp.task("bsfy", function(){
    var idx_deferred = q.defer();
    var demo_deferred = q.defer();
    del(['dist/index.js'], ['dist/demo.js']).then(function () {
        make_bundle({
            out_file: "dist/index.js",
            bsfy_opts: {entries: "lib/index.js"},
            require: npm_deps
        }).on('end', idx_deferred.resolve);

        make_bundle({
            out_file: "dist/demo.js",
            bsfy_opts: {entries: "demo/demo.js"},
            require: npm_deps
        }).on('end', demo_deferred.resolve);
    });

    return q.all([idx_deferred.promise, demo_deferred.promise]);
});

