import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

let tinylr = require('tiny-lr-fork');

/**
 * @fileoverview File watcher for Grunt.js
 * Copyright (c) 2013 Daniel Steigerwald
 *
 * @param {Grunt} grunt - the grunt instance
 */
module.exports = function exports(grunt: IGrunt) {
    'use strict';

    /*globals process*/
    /*globals require*/

	let uniq: <T>(array: T[]) => T[] = grunt.util['_'].uniq,
		DEBOUNCE_DELAY = 200,
        WAIT_FOR_UNLOCK_INTERVAL = 10,
        WAIT_FOR_UNLOCK_TRY_LIMIT = 50;

    var files: string[] = [],
        changedFilesForLiveReload: string[] = [],

        isRunning = false,
        deferredFiles: string[] = [],
        dispatchers: string[] = [],

        done: any,

        firstRun = true,
        lrServer: any,
        options: any,
        watchers = {};

    if (semver.lt(process.versions.node, '0.9.2')) {
        grunt.fail.warn('Use node 0.9.2+, due to buggy fs.watch');
    }

    grunt.registerTask('watch', 'Erkalicious files watcher.', function watch() {
        options = this.options({
            dirs: [
                '!bower_components',
                '!node_modules'
            ],
            ignoredFiles: [],
            livereload: {
                enabled: true,
                port: 35729,
                extensions: ['js', 'css', 'html'],
				key: null,
				cert: null
            },

            // friendly beep on error
            beep: true,
            errorStack: true
        });

        done = this.async();

        if (firstRun) {
            firstRun = false;

            if (options.livereload.enabled) {
                grunt.log.writeln('Starting live reload server on port: ' + options.livereload.port);
                runLiveReloadServer();
            }

            keepThisTaskRunForeverViaHideousHack();
        }

        refreshWatchers();

        grunt.log.ok('Waiting...');

        isRunning = false;
        dispatchWaitingChanges();
    });

    function dispatchWaitingChanges() {
        if (isRunning) {
            return;
        }

        if (deferredFiles.length) {
            var theFiles = <string[]>uniq(deferredFiles),
                theDispatchers = <string[]>uniq(dispatchers);

            deferredFiles.length = 0;
            dispatchers.length = 0;

            grunt['verbose'].ok('Files changed within watch task:\n' + theFiles.join('\n'));

            theFiles.forEach(function dispatch(filepath) {
                if (theDispatchers.indexOf(filepath) === -1) {
                    grunt['verbose'].ok('dispatched deferred: ' + filepath);
                    onFileChange(filepath);
                } else {
                    grunt['verbose'].ok('Didn\'t dispatch: ' + filepath);
                }
            });
        }
    }

    // TODO: handle hypothetic situation, when task create dir
    function refreshWatchers() {
        var start = Date.now(),
            allDirs = grunt.file.expand(options.dirs),
            dirsAlreadyWatched = Object.keys(watchers),
            newDirs: string[] = [],
            oldDirs: string[] = [];

        allDirs.forEach(function watchDir(dir) {
            if (!watchers[dir]) {
                newDirs.push(dir);

                watchers[dir] = fs.watch(dir, function fireCallback(event, filename) {
                    onDirChange(event, filename, dir);
                });
            }
        });

        for (var i = 0; i < dirsAlreadyWatched.length; i++) {
            var dir = dirsAlreadyWatched[i];

            if (allDirs.indexOf(dir) === -1) {
                oldDirs.push(dir);

                watchers[dir].close();
                delete watchers[dir];
            }
        }

        function dirString(num: number) {
            if (num === 1) {
                return 'dir is';
            }

            return 'dirs are';
        }

        if (oldDirs.length) {
            grunt['verbose'].writeln('Dirs removed from watch list: ' + oldDirs.join(', '));

            grunt.log.writeln((oldDirs.length + ' ' + dirString(oldDirs.length) + ' no longer watched').cyan);
        }

        if (newDirs.length) {
            grunt['verbose'].writeln('Dirs added to watch list: ' + newDirs.join(', '));

            grunt.log.writeln((newDirs.length + ' more ' + dirString(newDirs.length) + ' now being watched, within ' + (Date.now() - start) + ' ms.').cyan);
        }
    }

    function runLiveReloadServer() {
        /*globals Buffer*/

        // If key and cert file paths are provided, read them.
        ['key', 'cert'].forEach(function read(attr) {
            if (options.livereload[attr] && !Buffer.isBuffer(options.livereload[attr])) {
                options.livereload[attr] = grunt.file.read(options.livereload[attr]);
            }
        });

        lrServer = tinylr(options.livereload);
        lrServer.server.removeAllListeners('error');

        lrServer.server.on('error', function error(err: any) {
            if (err.code === 'EADDRINUSE') {
                grunt.fatal('Port ' + options.livereload.port + ' is already in use by another process.');
                grunt.fatal('Open OS process manager and kill all node\'s processes.');
            } else {
                grunt.fatal(err);
            }

            process.exit(1);
        });

        lrServer.listen(options.livereload.port, function livereloadError(err: Error) {
            if (err) {
                grunt.fatal(err);

                return;
            }

            grunt['verbose'].ok('LiveReload server successfully started on port: ' + options.livereload.port);
        });
    }

    function stopAndRun(tasks: string[], reset: boolean = false) {
        tasks.push('watch');

        if (reset) {
            files.length = 0;
            changedFilesForLiveReload.length = 0;
            deferredFiles.length = 0;
            dispatchers.length = 0;
        }

        if (done) {
            done();
            done = null;
            grunt['verbose'].ok('Called grunt este watch done');
        } else if (grunt.task.current.async) {
            grunt['verbose'].ok('Called done of the current task');
            grunt.task.current.async()();
        }

        grunt.task.clearQueue();
        grunt.task.run(tasks);
    }

    // TODO: fork&fix Grunt
    function keepThisTaskRunForeverViaHideousHack() {
        function createLog(isWarning: boolean) {
            return function log(e: any) {
                var message: string;

                if (typeof e === 'string') {
                    message = e;
                } else {
                    message = (options.errorStack && e.stack) ? e.stack : e.message;
                }

                var line = options.beep ? '\x07' : '';

                if (isWarning) {
                    line += ('Warning: ' + message).yellow;
                } else {
                    line += ('Fatal error: ' + message).red;
                }

                grunt.log.writeln(line);

                if (!grunt.option('force')) {
                    stopAndRun([], true);
                }
            };
        }

        grunt.warn = grunt.fail.warn = createLog(true);
        grunt.fatal = grunt.fail.fatal = createLog(false);
    }

    function onDirChange(event: string, filename: string, dir: string) {
        var filepath = path.join(dir || '', filename || '');

        // Normalize \\ paths to / paths. Yet another Windows fix.
        filepath = filepath.replace(/\\/g, '/');

        var minimatchOptions = {
            dot: true,
            matchBase: true,
            nocomment: true,
            nonegate: true
        };

        if (grunt.file.isMatch(minimatchOptions, options.ignoredFiles, filepath)) {
            return;
        }

        // fs.statSync fails on deleted symlink dir with 'Abort trap: 6' exception
        // https://github.com/bevry/watchr/issues/42
        // https://github.com/joyent/node/issues/4261
        var fileExists = fs.existsSync(filepath);

        if (!fileExists) {
            return;
        }

        grunt['verbose'].ok('changed: ' + filepath);

        if (fs.statSync(filepath).isDirectory()) {
            grunt['verbose'].ok('Dir changed: ' + filepath);
        } else if (isRunning) {
            grunt['verbose'].ok('Still running, so defer: ' + filepath);
            deferredFiles.push(filepath);
        } else {
            onFileChange(filepath);
        }
    }

    function onFileChange(filepath: string) {
        var minimatchOptions = {
            dot: true,
            matchBase: true,
            nocomment: true,
            nonegate: true
        };

        if (grunt.file.isMatch(minimatchOptions, options.ignoredFiles, filepath)) {
            return;
        }

        if (options.livereload.enabled) {
            changedFilesForLiveReload.push(filepath);
        }

        files.push(filepath);
        runQueue();
    }

    function getFilepathTasks(filepath: string) {
        var ext = path.extname(filepath).slice(1),
            config = grunt.config.get('watch')[ext];

        if (!config) {
            config = grunt.config.get('watch')['*'];
        }

        if (!config) {
            return [];
        }

        var tasks = config(filepath) || [];

        if (!Array.isArray(tasks)) {
            tasks = [tasks];
        }

        return tasks;
    }

    var runRequest: NodeJS.Timer;

    function runQueue() {
        // No-op if no files have been changed
        if (!files.length) {
            return;
        }

        clearTimeout(runRequest);

        // Create a timeout that simulates an asynchronous request. Add a short
        //   time to catch the instances where child tasks edit files more than
        //   once.
        runRequest = setTimeout(function runTasks() {
            isRunning = true;

            var theFiles = <string[]>uniq(files);

            files.length = 0;

            var tasks: string[][] = [],
                taskFiles: string[] = [];

            for (var i = 0; i < theFiles.length; i++) {
                var filepath = theFiles[i],
                    fileTasks = getFilepathTasks(filepath);

                if (fileTasks.length) {
                    var waitTryCount = 0;

                    waitForFileUnlock(filepath, fileTasks);
                }
            }

            function waitForFileUnlock(filepath: string, fileTasks: string[]) {
                var isLocked = false,
                    unlockTimer: any;

                waitTryCount++;

                try {
                    fs.readFileSync(filepath);
                } catch (e) {
                    // File is locked
                    isLocked = true;
                }

                if (!isLocked || waitTryCount > WAIT_FOR_UNLOCK_TRY_LIMIT) {
                    taskFiles.push(filepath);
                    dispatchers.push(filepath);

                    var wasEqual = false;

                    listEquality: for (var i = 0; i < tasks.length; i++) {
                        var addedTasks = tasks[i];

                        if (addedTasks.length !== fileTasks.length) {
                            continue;
                        }

                        for (var j = 0; j < addedTasks.length; j++) {
                            if (addedTasks[j] !== fileTasks[j]) {
                                continue listEquality;
                            }
                        }

                        wasEqual = true;
                        break;
                    }

                    if (!wasEqual) {
                        tasks.push(fileTasks);
                    }
                } else {
                    grunt['verbose'].writeln('Waiting for file to unlock (' + waitTryCount + '): ' + path);
                    clearTimeout(unlockTimer);
                    unlockTimer = setTimeout(waitForFileUnlock, WAIT_FOR_UNLOCK_INTERVAL);
                }
            }

            var livereloadFiles = uniq(changedFilesForLiveReload).filter(function filter(filepath) {
                return options.livereload.extensions.indexOf(path.extname(filepath).slice(1)) !== -1;
            });

            changedFilesForLiveReload.length = 0;

            var changedFiles = uniq(livereloadFiles.concat(taskFiles));

            grunt.log.writeln('');
            grunt.log.writeln('File(s) changed:');
            grunt.log.ok(changedFiles.join('\n'));

            if (options.livereload.enabled && livereloadFiles.length) {
                grunt['verbose'].ok('Notifying live reload about: ' + livereloadFiles.join(', '));

                lrServer.changed({
                    body: {
                        files: livereloadFiles
                    }
                });
            }

            if (tasks.length) {
                var flattenedTasks = tasks.reduce(function flatten(trans, arr) {
                    return trans.concat(arr);
                });

                stopAndRun(flattenedTasks);
            } else {
                grunt.log.writeln('');
                grunt.log.writeln('Continuing watch');
                grunt.log.ok('Waiting...');

                isRunning = false;
            }
        }, DEBOUNCE_DELAY);
    }
};
