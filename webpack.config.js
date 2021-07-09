import webpack from 'webpack';

const config = {
  mode: 'none',
  entry: './app/app.js',
  experiments: {
    outputModule: true
  },
  output: {
    libraryTarget: "module",
    filename: 'app.js'
  }
};

export default config;