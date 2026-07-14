import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',

      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Empty catch blocks are common for intentional fire-and-forget patterns
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Accessibility: errors for issues that break keyboard/screen-reader access
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/label-has-associated-control': 'warn',

      // Warnings for patterns that are intentional in drag-and-drop and canvas interfaces
      // (React's synthetic events cover keyboard for elements with explicit role/tabIndex)
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',

      // autoFocus is intentional in modals/forms - warn but don't block
      'jsx-a11y/no-autofocus': 'warn',
    },
    ignores: ['dist/**', 'node_modules/**'],
  },
);
