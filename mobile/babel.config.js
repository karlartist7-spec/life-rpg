module.exports = function (api) {
  api.cache(true)
  // NativeWind removed: the app uses inline styles only (no className), and
  // nativewind's react-native-css-interop babel demanded react-native-worklets/plugin
  // (a reanimated-4 dep) which breaks the SDK-52 build. babel-preset-expo auto-adds
  // react-native-reanimated/plugin when reanimated is installed, so no explicit plugin needed.
  return {
    presets: ['babel-preset-expo'],
  }
}
