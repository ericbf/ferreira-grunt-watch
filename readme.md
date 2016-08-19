# Erkalicious Grunt Watch

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install erkalicious-grunt-watch --save-dev
```

Once the plugin has been installed, the task can be loaded in your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('erkalicious-grunt-watch');
```

## Watch task
_Run this task with the `grunt watch` command._

### Settings

#### options.dirs

Note you have to specify only directory (`'dir'`), or directory recursively (`'dir/**/'`) with all its subdirectories.

Type: `string[]`
Default:

```js
[
	'!bower_components',
	'!node_modules'
]
```

List of watched directories.

#### options.livereload

Type: `Object`
Default:

```js
{
	enabled: true,
	port: 35729,
	extensions: ['js', 'css', 'html'],
	key: null,
	cert: null
}
```

### Examples

Watch and compile TypeScript.
```ts
watch: {
	options: {
		// just a dirs, no file paths
		dirs: ['dirOne/**/', 'dirTwo/**/']
	},
	ts: function typescript(filepath: string): string[] {
		let files = {
			expand: true,
			src: filepath,
			ext: '.js'
		};

		grunt.config(['coffee', 'app', 'files'], files);

		return ['compileTypescript']
	}
	// to define all
	'*': function all(filepath: string): string[] {
		return ['otherTask'];
	}
}
```

#### Live Reloading
Live reloading is built into the watch task and enabled by default.

## License
Copyright (c) 2015 Eric Ferreira

Licensed under the MIT license.
