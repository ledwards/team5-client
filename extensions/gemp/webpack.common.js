const path = require("path");
const webpack = require("webpack");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: {
    root: "./src/js/root.js",
    game: "./src/js/game.js",
    background: "./src/js/background.js",
  },
  module: {
    rules: [{ exclude: /node_modules/ }]
  },
  resolve: {
    extensions: [".js"],
  },
  plugins: [
    new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
    new CopyWebpackPlugin({
      patterns: [
        { from: ".env.json" },
        { from: "./src/manifest.json" },
        { from: "./src/data/Dark.json" },
        { from: "./src/data/Light.json" }
      ],
    }),
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
  output: { filename: "[name].js", path: path.resolve(__dirname, "dist") }, // chrome will look for files under dist/* folder
};
