module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.module.rules.push({
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
        include: /node_modules[\\/]@mui[\\/]/,
      });
      return webpackConfig;
    },
  },
};
