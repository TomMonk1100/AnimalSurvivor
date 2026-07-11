import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.timestamp-*.mjs'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', '*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        PointerEvent: 'readonly',
        KeyboardEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        WebGL2RenderingContext: 'readonly',
        console: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Gameplay determinism guard: no Math.random anywhere in app source.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Rendering must never draw randomness; the simulation owns all RNG.' },
      ],
    },
  },
];
