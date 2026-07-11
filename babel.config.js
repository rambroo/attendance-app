module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        // Strip console.* from release bundles (keeps errors out of logcat
        // and avoids serializing large payloads for logs nobody sees).
        plugins: ['transform-remove-console'],
      },
    },
  };
};
