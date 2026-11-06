// Local newsroom admin + preview server (no extra dependencies).
//   npm run admin   → http://localhost:4321/admin   (write/edit articles, upload photos, rebuild, publish)
//   npm run serve   → preview the built site only
// Binds to 127.0.0.1 so it is never reachable from other machines.
import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { build } from '../src/build.js';
import { slugify } from '../src/utils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ARTICLES = path.join(ROOT, 'content/articles');
const IMAGES = path.join(ROOT, 'content/images');
const PORT = Number(process.env.PORT || 4321);
const PREVIEW_ONLY = process.argv.includes('--preview-only');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const safeName = (f) => /^[a-z0-9][a-z0-9._-]*\.md$/i.test(f || '') ? f : null;
const readBody = (req, limit = 25e6) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Upload too large (max 25 MB)')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});
const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { cwd: ROOT }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout + stderr).trim() })));

let building = Promise.resolve();
const rebuild = () => (building = building.then(() => build({ quiet: true })).catch((e) => { console.error(e); throw e; }));

function istLocalNow() {
  const d = new Date(Date.now() + 330 * 60000);
  return d.toISOString().slice(0, 16);
}

async function listArticles() {
  const files = (await fs.readdir(ARTICLES)).filter((f) => f.endsWith('.md'));
  const items = [];
  for (const f of files) {
    const { data } = matter(await fs.readFile(path.join(ARTICLES, f), 'utf8'));
    items.push({ file: f, title: data.title, category: data.category, date: data.date ? new Date(data.date).toISOString() : '', draft: !!data.draft, slug: data.slug || slugify(f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')) });
  }
  return items.sort((a, b) => (b.date > a.date ? 1 : -1));
}

async function saveArticle(payload) {
  const p = payload || {};
  if (!p.title || !String(p.title).trim()) throw new Error('Title is required');
  if (!p.category) throw new Error('Category is required');
  // Date arrives as "YYYY-MM-DDTHH:mm" in IST from the form
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.date || '') ? p.date : istLocalNow();
  const iso = `${local}:00+05:30`;
  let file = safeName(p.file);
  const slug = slugify(p.slug || p.title);
  if (!file) {
    file = `${local.slice(0, 10)}-${slug}.md`;
    let n = 2;
    while (fss.existsSync(path.join(ARTICLES, file))) file = `${local.slice(0, 10)}-${slug}-${n++}.md`;
  }
  let image = p.image || '';
  if (p.imageData) {
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(p.imageData);
    if (!m) throw new Error('Image must be JPG, PNG or WebP');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    image = `${slug.slice(0, 60)}.${ext}`;
    await fs.writeFile(path.join(IMAGES, image), Buffer.from(m[2], 'base64'));
  }
  const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sources = String(p.sources || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, url] = l.split('|').map((s) => s.trim());
    return url ? { name, url } : { name };
  });
  const fm = {
    title: String(p.title).trim(),
    ...(p.seoTitle ? { seoTitle: p.seoTitle.trim() } : {}),
    description: String(p.description || '').trim(),
    category: p.category,
    ...(p.kicker ? { kicker: p.kicker.trim() } : {}),
    author: list(p.author).length > 1 ? list(p.author) : (list(p.author)[0] || 'mumbai-bureau'),
    date: iso,
    ...(p.updated ? { updated: new Date().toISOString() } : p.prevUpdated ? { updated: p.prevUpdated } : {}),
    ...(p.location ? { location: p.location.trim() } : {}),
    ...(image ? { image } : {}),
    ...(p.imageAlt ? { imageAlt: p.imageAlt.trim() } : {}),
    ...(p.imageCaption ? { imageCaption: p.imageCaption.trim() } : {}),
    ...(p.imageCredit ? { imageCredit: p.imageCredit.trim() } : {}),
    ...(p.imageLicense ? { imageLicense: p.imageLicense.trim() } : {}),
    ...(p.imageSource ? { imageSource: p.imageSource.trim() } : {}),
    tags: list(p.tags),
    ...(p.featured ? { featured: true } : {}),
    ...(p.breaking ? { breaking: true } : {}),
    ...(Number(p.priority) ? { priority: Number(p.priority) } : {}),
    ...(p.draft ? { draft: true } : {}),
    ...(p.slug ? { slug } : {}),
    ...(sources.length ? { sources } : {}),
  };
  await fs.writeFile(path.join(ARTICLES, file), matter.stringify('\n' + String(p.body || '').trim() + '\n', fm));
  await rebuild();
  return { file, url: `/${fm.category}/${slug}/`, draft: !!fm.draft, scheduled: new Date(iso) > new Date() };
}

async function publishLive() {
  if (!fss.existsSync(path.join(ROOT, '.git'))) return { ok: false, out: 'This folder is not a git repository yet. See README → "Go live" to connect GitHub + Netlify/Cloudflare Pages.' };
  const remote = await run('git', ['remote']);
  if (!remote.out) return { ok: false, out: 'No git remote configured. Add one with: git remote add origin <your GitHub repo URL>' };
  await run('git', ['add', '-A']);
  const commit = await run('git', ['commit', '-m', `Publish: ${new Date().toISOString()}`]);
  const push = await run('git', ['push']);
  if (push.ok) {
    // Tell Bing/Yandex/Seznam (IndexNow) about new URLs once the host has had time to deploy.
    setTimeout(() => run(process.execPath, [path.join(ROOT, 'scripts/indexnow.js')]).then((r) => console.log('[indexnow]', r.out)), 120000);
  }
  return { ok: push.ok, out: [commit.out, push.out].filter(Boolean).join('\n') };
}

async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.includes('..')) return send(res, 400, 'Bad path', 'text/plain');
  let file = path.join(DIST, p);
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  try {
    const st = await fs.stat(file);
    if (st.isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
    return send(res, 200, await fs.readFile(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch {
    const nf = path.join(DIST, '404.html');
    return send(res, 404, fss.existsSync(nf) ? await fs.readFile(nf) : 'Not found', 'text/html; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (!PREVIEW_ONLY) {
      if (url.pathname === '/admin' || url.pathname === '/admin/') return send(res, 200, await fs.readFile(path.join(ROOT, 'scripts/admin.html')), 'text/html; charset=utf-8');
      if (url.pathname === '/api/meta' && req.method === 'GET') {
        const [categories, authors, articles] = await Promise.all([fs.readFile(path.join(ROOT, 'data/categories.json'), 'utf8'), fs.readFile(path.join(ROOT, 'data/authors.json'), 'utf8'), listArticles()]);
        const images = (await fs.readdir(IMAGES)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
        return send(res, 200, { categories: JSON.parse(categories), authors: JSON.parse(authors), articles, images, now: istLocalNow() });
      }
      if (url.pathname === '/api/article' && req.method === 'GET') {
        const f = safeName(url.searchParams.get('file'));
        if (!f) return send(res, 400, { error: 'Bad file name' });
        const { data, content } = matter(await fs.readFile(path.join(ARTICLES, f), 'utf8'));
        return send(res, 200, { file: f, data, body: content.trim() });
      }
      if (url.pathname === '/api/article' && req.method === 'POST') {
        const result = await saveArticle(JSON.parse(await readBody(req)));
        return send(res, 200, { ok: true, ...result });
      }
      if (url.pathname === '/api/publish' && req.method === 'POST') return send(res, 200, await publishLive());
      if (url.pathname === '/api/rebuild' && req.method === 'POST') { await rebuild(); return send(res, 200, { ok: true }); }
    }
    return serveStatic(req, res);
  } catch (e) {
    return send(res, 500, { ok: false, error: e.message });
  }
});

await rebuild();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Site preview:  http://localhost:${PORT}/`);
  if (!PREVIEW_ONLY) console.log(`  Newsroom admin: http://localhost:${PORT}/admin\n`);
});
