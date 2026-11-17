const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const existing = config.resolver.blockList;

// Native builds create thousands of files that Metro does not need to watch.
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[\\/]\.cxx[\\/]/,
  /[\\/]android[\\/](?:build|\.gradle|app[\\/]build)[\\/]/,
  /[\\/]apk[\\/]/,
];

module.exports = config;
