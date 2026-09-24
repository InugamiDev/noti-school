import { writeFile } from 'node:fs/promises';
// tsc retains the shared environment module's relative path inside the build output.
await writeFile(new URL('./dist/server.js', import.meta.url), "import './apps/auth/src/server.js';\n");
