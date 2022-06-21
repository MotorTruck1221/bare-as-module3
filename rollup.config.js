import { resolve } from 'path';

import babel from '@rollup/plugin-babel';
import inject from '@rollup/plugin-inject';
import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';

export default [
	['esm', 'src/BareClient.ts', 'named', false, [false]], // import
	['umd', 'src/index.ts', 'default', true, [true, false]], // require, minify for browser
]
	.map(([format, input, exports, commonjs, modes]) =>
		modes.map(minify => ({
			input,
			output: {
				file: `dist/BareClient.${format}${minify ? '.min' : ''}${
					commonjs ? '.cjs' : '.js'
				}`,
				format,
				name: 'BareClient',
				exports,
			},
			plugins: [
				inject(
					Object.fromEntries(
						['fetch', 'Request', 'Response', 'WebSocket', 'XMLHttpRequest'].map(
							name => [resolve('src/snapshot.ts'), name]
						)
					)
				),
				typescript(),
				babel({ babelHelpers: 'bundled', extensions: ['.ts'] }),
				minify && terser(),
			],
		}))
	)
	.flat(1);
