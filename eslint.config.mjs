import { fixupConfigRules } from '@eslint/compat';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: ['.next/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'],
  },
  // Bridge legacy rule APIs until all Next.js plugins support ESLint 10.
  ...fixupConfigRules([...nextVitals, ...nextTypescript]),
];

export default eslintConfig;
