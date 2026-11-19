module.exports = {
  // Tailwind CSS 4 + daisyUI 5 (src/tailwind.css), next to MUI while pages move over one by one.
  style: {
    postcss: {
      mode: "extends",
      loaderOptions: (postcssLoaderOptions) => {
        // Tailwind first: it builds the utilities / daisyUI classes, CRA's plugins then run on the result.
        const options = postcssLoaderOptions.postcssOptions || {};
        const existing = typeof options.plugins === "function" ? options.plugins() : options.plugins || [];
        postcssLoaderOptions.postcssOptions = {
          ...options,
          plugins: [require("@tailwindcss/postcss"), ...existing],
        };
        return postcssLoaderOptions;
      },
    },
  },
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
