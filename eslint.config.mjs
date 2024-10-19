import { fixupPluginRules, includeIgnoreFile } from '@eslint/compat';
import pluginJs from '@eslint/js';
import eslintConfig from '@metamask/eslint-config';
import jestEslintConfig from '@metamask/eslint-config-jest';
import mochaEslintConfig from '@metamask/eslint-config-mocha';
import nodeEslintConfig from '@metamask/eslint-config-nodejs';
import tsEslintConfig from '@metamask/eslint-config-typescript';
import { rules as pluginDesignTokens } from '@metamask/eslint-plugin-design-tokens';
import pluginMocha from 'eslint-plugin-mocha';
import pluginReact from 'eslint-plugin-react';
import globals from 'globals';
import path from 'path';
import tseslint from 'typescript-eslint';
import eslintPluginImportX from 'eslint-plugin-import-x';
import tsParser from '@typescript-eslint/parser';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import pluginReactHooks from 'eslint-plugin-react-hooks';

// import pluginLodash from 'eslint-plugin-lodash';

export default [
  {
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
    },
  },
  pluginJs.configs.recommended,
  eslintPluginImportX.flatConfigs.recommended,
  eslintPluginImportX.flatConfigs.typescript,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginMocha.configs.flat.recommended,
  eslintPluginPrettierRecommended,
  // pluginReactHooks.flatConfigs.recommended,
  includeIgnoreFile(path.resolve('.prettierignore')),
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: {
      eslintConfig,
      // pluginLodash,
      nodeEslintConfig,
      tsEslintConfig,
      mochaEslintConfig,
      jestEslintConfig,
      pluginDesignTokens,
      pluginReact: {
        settings: {
          react: {
            version: '16',
          },
        },
      },
      'react-hooks': pluginReactHooks,
      eslintPluginImportX,
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      // Modified to include the 'ignoreRestSiblings' option.
      // TODO: Migrate this rule change back into `@metamask/eslint-config`
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // '@metamask/eslint-plugin-design-tokens/color-no-hex': 'warn',
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: './',
          zones: [
            {
              target: './app',
              from: './ui',
              message:
                'Should not import from UI in background, use shared directory instead',
            },
            {
              target: './ui',
              from: './app',
              message:
                'Should not import from background in UI, use shared directory instead',
            },
            {
              target: './shared',
              from: './app',
              message: 'Should not import from background in shared',
            },
            {
              target: './shared',
              from: './ui',
              message: 'Should not import from UI in shared',
            },
          ],
        },
      ],
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          // ignoreDeclarationSort: true,
          // ignoreMemberSort: true,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: false,
        },
      ],
    },
  },
  // eslintConfigPrettier,
];
