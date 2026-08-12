const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  fetch: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  encodeURIComponent: 'readonly',
  Math: 'readonly',
  Date: 'readonly',
  JSON: 'readonly',
  Number: 'readonly',
  String: 'readonly',
  Object: 'readonly',
  Array: 'readonly',
  Boolean: 'readonly',
  Promise: 'readonly',
  Error: 'readonly',
  Set: 'readonly',
  parseInt: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  require: 'readonly',
  module: 'readonly',
};

export default [
  {
    ignores: ['node_modules/', 'coverage/', 'playwright-report/', 'test-results/', 'data/'],
  },
  {
    files: ['backend/**/*.js', 'tests/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...nodeGlobals },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-dupe-keys': 'error',
      'no-else-return': 'warn',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
    },
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', args: 'none', caughtErrors: 'none' },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-dupe-keys': 'error',
      'no-else-return': 'warn',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
    },
  },
];
