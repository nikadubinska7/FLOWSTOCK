import tseslint from 'typescript-eslint';
export default [{ignores:['.next/**','node_modules/**','.venv/**','data/**','models/**']},{files:['src/**/*.{ts,tsx}','tests/**/*.ts'],languageOptions:{parser:tseslint.parser},rules:{'no-constant-condition':'error','no-duplicate-case':'error','no-unreachable':'error','no-debugger':'error'}}];
