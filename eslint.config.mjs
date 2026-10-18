import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'playwright-report/**', 'test-results/**', '.vercel/**', 'diff.txt', 'myerr.txt', 'original_App.tsx'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', '*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly' } },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: { self: 'readonly', URL: 'readonly' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
    },
  },
);
