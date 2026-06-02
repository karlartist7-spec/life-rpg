// Pure-logic tests only (src/lib/*.test.ts). We intentionally do NOT render
// React Native components here — reanimated/gesture-handler under jsdom is
// flaky and UI is verified on a real device instead. Keep tested modules free
// of RN imports.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/lib/**/*.test.ts'],
}
