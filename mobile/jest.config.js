// Pure-logic tests only (src/lib/*.test.ts). We intentionally do NOT render
// React Native components — the modules under test import zero RN runtime, so a
// minimal self-contained babel TS transform (node env) is all we need. We do
// NOT use the jest-expo preset: it loads RN's Flow-typed setup, which is both
// unnecessary here and breaks under plain Node. Keep tested modules RN-free.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/lib/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
}
