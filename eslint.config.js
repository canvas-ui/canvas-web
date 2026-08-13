import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Honor the codebase's `_`-prefix convention for intentionally unused
      // bindings, and allow rest-destructuring used to omit properties.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Deliberate exceptions, kept visible as warnings rather than silenced:
    // the socket hooks publish the just-created socket instance synchronously
    // (consumers must see the handle before connect resolves; socket.io queues
    // pre-connect emits), and CanvasGrid's navigation reset interleaves state
    // with ref writes that a render-time reset is not allowed to touch.
    files: [
      'src/hooks/useSocket.ts',
      'src/hooks/useAgentSocket.ts',
      'src/components/canvas/CanvasGrid.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
)
