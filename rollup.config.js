import commonjs from 'rollup-plugin-commonjs';
import {terser} from 'rollup-plugin-terser';
import resolve from 'rollup-plugin-node-resolve';
import postcss from 'rollup-plugin-postcss';
import postcssCopy from 'postcss-copy';
import path from 'path';

export default [
  {
    input: 'bldrwnsch.js',
    output: {
      file: 'dist/bldrwnsch.js',
      format: 'iife'
    },
    plugins: [
      resolve(),
      commonjs(),
      terser(),
      postcss({
        extract: path.join('dist', 'style.css'),
        plugins: [postcssCopy({dest: 'dist', template: 'images/[name].[ext]'})]
      })
    ]
  }
];
