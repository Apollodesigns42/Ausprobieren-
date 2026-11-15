// Baut aus index.html, styles.css und app.js eine einzelne Datei ohne äußere Dokument-Tags.
// Aufruf: node tools/build-artifact.mjs <Zieldatei>
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const html = read('index.html');
const part = (name) => html.split(`<!--${name}-->`)[1].split(`<!--/${name}-->`)[0];
const head = part('ARTIFACT-HEAD').replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('styles.css')}</style>`);
const body = part('ARTIFACT-BODY').replace('<script src="app.js"></script>', `<script>\n${read('app.js')}</script>`);
writeFileSync(process.argv[2], head.trim() + '\n' + body.trim() + '\n');
