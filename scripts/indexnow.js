// Notify IndexNow search engines (Bing, Yandex, Seznam, Naver…) about fresh URLs.
// Run after the site is live:  npm run indexnow   (pass --all to submit every URL in the sitemaps)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = config.url.replace(/\/+$/, '');
if (!config.indexNowKey) { console.log('No indexNowKey in site.config.json'); process.exit(0); }

const all = process.argv.includes('--all');
const locs = async (file) => {
  try { return [...(await fs.readFile(path.join(ROOT, 'dist', file), 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]); } catch { return []; }
};
let urls = await locs('news-sitemap.xml');
if (all) {
  const index = await locs('sitemap.xml');
  for (const sm of index) urls.push(...(await locs(new URL(sm).pathname.slice(1))));
}
urls = [...new Set([SITE + '/', SITE + '/latest/', ...urls])].filter((u) => u.startsWith(SITE) && !u.endsWith('.xml')).slice(0, 10000);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: config.indexNowKey, keyLocation: `${SITE}/${config.indexNowKey}.txt`, urlList: urls }),
});
console.log(`IndexNow: submitted ${urls.length} URLs → HTTP ${res.status} ${res.status === 200 || res.status === 202 ? '(accepted)' : await res.text()}`);
