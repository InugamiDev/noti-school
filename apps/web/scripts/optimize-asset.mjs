import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
// Source: a reduced-motion canvas capture of src/scene.ts at a 1680x1000 viewport.
const source = process.argv[2];
if (!source) throw new Error('Pass the rendered scene capture path');
const bytes = await readFile(source);
const sha = createHash('sha256').update(bytes).digest('hex');
if (sha !== '16f9a2dd586eab9906d9481713c090b6ecbf20b0eb39fa589291634ae877411b') throw new Error('Unapproved asset');
await mkdir('public', { recursive: true });
const result = await sharp(bytes).resize({ width: 1680, withoutEnlargement: true }).webp({ quality: 78, effort: 6 }).toBuffer();
await writeFile('public/archive.webp', result);
await writeFile('public/archive.provenance.json', JSON.stringify({ source, source_sha256: sha, output_sha256: createHash('sha256').update(result).digest('hex'), bytes: result.length, operation: 'sharp 0.35.4, width 1680 without enlargement, WebP quality 78 effort 6', use: 'Illustrative fallback only; not institutional evidence' }, null, 2));
