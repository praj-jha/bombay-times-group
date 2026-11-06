// Static site build: content/*.md  ->  dist/  (HTML, images, sitemaps, feeds, robots, manifest)
// Usage: npm run build
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import sharp from 'sharp';
import { createTemplates } from './templates.js';
import { esc, xmlEsc, slugify, isoIST, fmtDate, wordCount, readMinutes, truncate, chunk } from './utils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const IMG_OUT = path.join(DIST, 'images');
const r = (...p) => path.join(ROOT, ...p);
const readJSON = async (p) => JSON.parse(await fs.readFile(r(p), 'utf8'));

const IMAGE_WIDTHS = [400, 800, 1200];

export async function build({ quiet = false } = {}) {
  const t0 = Date.now();
  const log = (...m) => !quiet && console.log(...m);
  const config = await readJSON('site.config.json');
  const categories = await readJSON('data/categories.json');
  const authors = await readJSON('data/authors.json');
  const SITE = config.url.replace(/\/+$/, '');
  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c]));
  const authorMap = Object.fromEntries(authors.map((a) => [a.slug, a]));
  const buildTime = new Date();

  // ---- Clean dist (keep processed image cache) ----
  await fs.mkdir(DIST, { recursive: true });
  for (const entry of await fs.readdir(DIST)) {
    if (entry !== 'images') await fs.rm(path.join(DIST, entry), { recursive: true, force: true });
  }
  await fs.mkdir(IMG_OUT, { recursive: true });

  // ---- Static public files ----
  await fs.cp(r('public'), DIST, { recursive: true });

  // ---- Fingerprinted CSS/JS ----
  const assets = {};
  await fs.mkdir(path.join(DIST, 'assets'), { recursive: true });
  for (const [key, file] of [['css', 'style.css'], ['js', 'main.js']]) {
    const src = await fs.readFile(r('src/assets', file), 'utf8');
    const hash = crypto.createHash('md5').update(src).digest('hex').slice(0, 8);
    const name = file.replace('.', `.${hash}.`);
    await fs.writeFile(path.join(DIST, 'assets', name), src);
    assets[key] = `/assets/${name}`;
  }

  // ---- Markdown ----
  const renderer = new marked.Renderer();
  renderer.link = function ({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const external = /^https?:\/\//.test(href) && !href.startsWith(SITE);
    return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
  };
  // Supports "## Heading {#custom-id}" anchors (used by policy pages and structured data links).
  renderer.heading = function ({ tokens, depth }) {
    let html = this.parser.parseInline(tokens);
    let id = '';
    html = html.replace(/\s*\{#([\w-]+)\}\s*$/, (_, m) => { id = m; return ''; });
    return `<h${depth}${id ? ` id="${id}"` : ''}>${html}</h${depth}>\n`;
  };
  renderer.image = function ({ href, title, text }) {
    return `<figure class="inline-figure"><img src="${esc(href)}" alt="${esc(text)}" loading="lazy" decoding="async">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}</figure>`;
  };
  marked.use({ renderer, gfm: true });

  // ---- Load articles ----
  const tagMap = new Map();
  const files = (await fs.readdir(r('content/articles'))).filter((f) => f.endsWith('.md'));
  const articles = [];
  const problems = [];
  for (const file of files) {
    const raw = await fs.readFile(r('content/articles', file), 'utf8');
    const { data: fm, content } = matter(raw);
    if (fm.draft) continue;
    const date = new Date(fm.date);
    if (isNaN(date)) { problems.push(`${file}: missing/invalid "date"`); continue; }
    if (date > buildTime) { log(`  (scheduled, skipped) ${file}`); continue; }
    if (!catMap[fm.category]) { problems.push(`${file}: unknown category "${fm.category}"`); continue; }
    if (!fm.title) { problems.push(`${file}: missing "title"`); continue; }
    const slug = fm.slug || slugify(file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''));
    const authorSlugs = [].concat(fm.author || fm.authors || 'mumbai-bureau');
    const arAuthors = authorSlugs.map((s) => authorMap[s] || { slug: slugify(s), name: s, type: 'Person', bio: '' });
    const tags = [].concat(fm.tags || []).map((name) => {
      const t = { name: String(name), slug: slugify(name) };
      if (!tagMap.has(t.slug)) tagMap.set(t.slug, { ...t, items: [] });
      return t;
    });
    let html = marked.parse(content);
    const words = wordCount(html);
    const sources = [].concat(fm.sources || []).map((s) => (typeof s === 'string' ? { name: s } : s));
    articles.push({
      file, slug, title: String(fm.title), seoTitle: fm.seoTitle, kicker: fm.kicker,
      description: String(fm.description || truncate(html.replace(/<[^>]+>/g, ' '), 158)),
      category: fm.category, url: `/${fm.category}/${slug}/`,
      date, updated: fm.updated ? new Date(fm.updated) : null,
      authors: arAuthors, tags, html, words, minutes: readMinutes(words),
      image: fm.image, imageAlt: fm.imageAlt, imageCaption: fm.imageCaption,
      imageCredit: fm.imageCredit, imageLicense: fm.imageLicense, imageSource: fm.imageSource,
      location: fm.location, featured: !!fm.featured, breaking: !!fm.breaking, priority: Number(fm.priority || 0),
      sources,
    });
  }
  if (problems.length) {
    console.error('\nContent problems:\n  ' + problems.join('\n  '));
    if (process.env.STRICT) process.exit(1);
  }
  articles.sort((a, b) => b.date - a.date);
  const seen = new Set();
  for (const a of articles) {
    if (seen.has(a.url)) problems.push(`Duplicate URL ${a.url} (${a.file}) — set a unique "slug"`);
    seen.add(a.url);
    for (const t of a.tags) tagMap.get(t.slug).items.push(a);
  }

  // ---- Images: 16:9 responsive WebP + 16:9 / 4:3 / 1:1 JPEGs for Google & social ----
  async function processImage(file) {
    const src = r('content/images', file);
    if (!fss.existsSync(src)) { problems.push(`Image not found: content/images/${file}`); return null; }
    const base = slugify(file.replace(/\.[a-z0-9]+$/i, ''));
    const srcMtime = (await fs.stat(src)).mtimeMs;
    const out = (name) => path.join(IMG_OUT, name);
    const fresh = (name) => fss.existsSync(out(name)) && fss.statSync(out(name)).mtimeMs >= srcMtime;
    const jobs = [];
    for (const w of IMAGE_WIDTHS) {
      const name = `${base}-${w}.webp`;
      if (!fresh(name)) jobs.push(sharp(src).rotate().resize(w, Math.round((w * 9) / 16), { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 74 }).toFile(out(name)));
    }
    for (const [name, w, h] of [[`${base}-1200x675.jpg`, 1200, 675], [`${base}-1200x900.jpg`, 1200, 900], [`${base}-1200x1200.jpg`, 1200, 1200]]) {
      if (!fresh(name)) jobs.push(sharp(src).rotate().resize(w, h, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 80, progressive: true, mozjpeg: true }).toFile(out(name)));
    }
    await Promise.all(jobs);
    return {
      widths: IMAGE_WIDTHS,
      webp: (w) => `/images/${base}-${w}.webp`,
      r169: `/images/${base}-1200x675.jpg`,
      r43: `/images/${base}-1200x900.jpg`,
      r11: `/images/${base}-1200x1200.jpg`,
    };
  }
  const imageCache = new Map();
  for (const a of articles) {
    if (!a.image) continue;
    if (!imageCache.has(a.image)) imageCache.set(a.image, await processImage(a.image));
    a.img = imageCache.get(a.image);
  }

  // ---- Templates ----
  const T = createTemplates({ config, SITE, categories, catMap, authorMap, assets, buildTime });
  const pages = []; // for sitemap: {path, lastmod}
  async function writePage(urlPath, html, sitemap = true, lastmod = buildTime) {
    const dir = path.join(DIST, urlPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), html);
    if (sitemap) pages.push({ path: urlPath, lastmod });
  }

  const latestList = articles.slice(0, 8);
  const topStories = [...articles].sort((a, b) => (b.priority - a.priority) || ((b.featured + b.breaking) - (a.featured + a.breaking)) || (b.date - a.date)).slice(0, 5);
  const recent = articles.filter((a) => buildTime - a.date < 48 * 3600e3);
  const breaking = recent.filter((a) => a.breaking);
  const ticker = (breaking.length ? breaking : articles.slice(0, 6)).slice(0, 8);
  const newest = articles[0]?.date || buildTime;

  // ---- Article pages ----
  for (const a of articles) {
    const sameCat = articles.filter((x) => x !== a && x.category === a.category);
    const related = [...sameCat, ...articles.filter((x) => x !== a && x.category !== a.category)].slice(0, 4);
    // "Also read" internal link after the third paragraph of longer stories
    const also = related[0];
    if (also) {
      let n = 0;
      a.htmlWithAlso = a.html.replace(/<\/p>/g, (m) => (++n === 3 && (a.html.match(/<\/p>/g) || []).length >= 6
        ? `</p>\n<aside class="also-read"><span>Also read</span><a href="${also.url}">${esc(also.title)}</a></aside>` : m));
    }
    const view = { ...a, html: a.htmlWithAlso || a.html };
    const { html, crumbs } = T.articleBody(view, { related, latest: latestList.filter((x) => x !== a).slice(0, 6), top: topStories.filter((x) => x !== a).slice(0, 5) });
    const extraHead = [
      `<meta property="article:published_time" content="${isoIST(a.date)}">`,
      `<meta property="article:modified_time" content="${isoIST(a.updated || a.date)}">`,
      `<meta property="article:section" content="${esc(catMap[a.category].name)}">`,
      ...a.tags.map((t) => `<meta property="article:tag" content="${esc(t.name)}">`),
      ...a.authors.map((au) => `<meta property="article:author" content="${T.abs(`/author/${au.slug}/`)}">`),
      `<meta name="author" content="${esc(a.authors.map((au) => au.name).join(', '))}">`,
      a.tags.length ? `<meta name="news_keywords" content="${esc(a.tags.map((t) => t.name).join(', '))}">` : '',
    ].filter(Boolean).join('\n');
    const preload = a.img ? `<link rel="preload" as="image" type="image/webp" imagesrcset="${a.img.widths.map((w) => `${a.img.webp(w)} ${w}w`).join(', ')}" imagesizes="(max-width: 900px) 100vw, 800px" fetchpriority="high">` : '';
    const out = T.layout({
      title: a.seoTitle || a.title, description: truncate(a.description, 160), path: a.url, content: html,
      ogImage: a.img ? a.img.r169 : null, ogImageAlt: a.imageAlt, ogType: 'article', active: a.category, ticker, extraHead, preload,
      jsonld: [T.articleSchema(a), T.breadcrumbSchema(crumbs)],
    });
    await writePage(a.url, out, false);
  }

  // ---- Home ----
  {
    const used = new Set();
    const hero = articles.find((a) => a.featured) || articles[0];
    if (hero) used.add(hero);
    const side = articles.filter((a) => !used.has(a)).slice(0, 4);
    side.forEach((a) => used.add(a));
    const order = ['mumbai', 'india', 'business', 'sports', 'world', 'entertainment', 'education', 'tech', 'lifestyle', 'opinion'];
    const sections = order.map((slug) => {
      const all = articles.filter((a) => a.category === slug);
      const items = all.filter((a) => !used.has(a)).slice(0, slug === 'mumbai' ? 6 : 3);
      items.forEach((a) => used.add(a));
      return { cat: catMap[slug], items, total: all.length };
    }).filter((s) => s.items.length);
    const heroHtml = hero ? `<section class="hero-grid" aria-label="Top stories">
  ${T.card(hero, { variant: 'hero', eager: true })}
  <div class="hero-left">${side.slice(0, 2).map((a) => T.card(a, { dek: false, sizes: '(max-width: 1100px) 50vw, 260px' })).join('')}</div>
  <div class="hero-side"><h2 class="col-label">In Focus</h2>${side.slice(2).map((a) => T.card(a, { variant: 'text' })).join('')}</div>
</section>` : '<p class="empty">No stories yet. Add your first article in content/articles/.</p>';
    const sectionsHtml = sections.map((s) => `<section class="home-section" id="${s.cat.slug}" aria-labelledby="h-${s.cat.slug}">
  <div class="section-head"><h2 id="h-${s.cat.slug}"><a href="/${s.cat.slug}/">${esc(s.cat.name)}</a></h2><a class="more" href="/${s.cat.slug}/">All ${esc(s.cat.name)} News →</a></div>
  <div class="grid-3">${s.items.map((a) => T.card(a)).join('')}</div>
</section>`).join('\n');
    const content = `<h1 class="sr-only">${esc(config.name)} — Latest Mumbai, Maharashtra and India News Today</h1>
${heroHtml}
<div class="with-rail">
  <div>${sectionsHtml}</div>
  ${T.rail({ latest: latestList.slice(0, 8), top: topStories })}
</div>`;
    const homeLd = { '@type': 'CollectionPage', '@id': `${SITE}/#webpage`, url: SITE + '/', name: `${config.name} — Mumbai & India News`, isPartOf: { '@id': T.SITE_ID }, about: { '@id': T.ORG_ID }, inLanguage: config.language,
      mainEntity: { '@type': 'ItemList', itemListElement: articles.slice(0, 10).map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: T.abs(a.url) })) } };
    await writePage('/', T.layout({
      title: `${config.name} — Latest Mumbai News, India News & Breaking Headlines Today`, fullTitle: true,
      description: config.description, path: '/', content, active: 'home', ticker, jsonld: [homeLd],
      preload: hero && hero.img ? `<link rel="preload" as="image" type="image/webp" imagesrcset="${hero.img.widths.map((w) => `${hero.img.webp(w)} ${w}w`).join(', ')}" imagesizes="${T.HERO_SIZES}" fetchpriority="high">` : '',
    }), true, newest);
  }

  // ---- Listing helper (categories, tags, authors, latest) ----
  async function listing({ base, items, heading, title, description, intro, crumbs, active = '', indexable = true, extraLd = [] }) {
    const per = config.articlesPerPage || 18;
    const groups = items.length ? chunk(items, per) : [[]];
    for (let i = 0; i < groups.length; i++) {
      const page = i + 1;
      const urlPath = page === 1 ? base : `${base}page/${page}/`;
      const pageCrumbs = page === 1 ? crumbs : [...crumbs, [`Page ${page}`, urlPath]];
      const content = T.listingBody({ heading: page === 1 ? heading : `${heading} — Page ${page}`, intro: page === 1 ? intro : '', items: groups[i], latest: latestList.slice(0, 6), top: topStories, pagination: T.paginationHtml(base, page, groups.length), crumbs: pageCrumbs, lead: page === 1 });
      const ld = [{ '@type': 'CollectionPage', '@id': T.abs(urlPath) + '#webpage', url: T.abs(urlPath), name: heading, description, isPartOf: { '@id': T.SITE_ID }, inLanguage: config.language,
        mainEntity: { '@type': 'ItemList', itemListElement: groups[i].map((a, k) => ({ '@type': 'ListItem', position: k + 1, url: T.abs(a.url) })) } }, T.breadcrumbSchema(pageCrumbs), ...extraLd];
      const robots = indexable && items.length ? undefined : 'noindex,follow';
      await writePage(urlPath, T.layout({ title: page === 1 ? title : `${title} — Page ${page}`, description, path: urlPath, content, active, ticker, jsonld: ld, ...(robots ? { robots } : {}) }), indexable && items.length > 0, groups[i][0]?.date || buildTime);
    }
  }

  for (const c of categories) {
    const items = articles.filter((a) => a.category === c.slug);
    await listing({ base: `/${c.slug}/`, items, heading: `${c.name} News`, title: `${c.name} News Today: Latest ${c.name} Headlines & Updates`, description: c.description, intro: c.description, crumbs: [['Home', '/'], [c.name, `/${c.slug}/`]], active: c.slug });
  }
  await listing({ base: '/latest/', items: articles, heading: 'Latest News', title: 'Latest News Today: Live Mumbai & India Headlines', description: `All the latest stories from ${config.name}, newest first — Mumbai, India, business, sports, entertainment and world news.`, intro: 'Every story we publish, newest first.', crumbs: [['Home', '/'], ['Latest News', '/latest/']], active: 'latest' });
  for (const t of tagMap.values()) {
    await listing({ base: `/tag/${t.slug}/`, items: t.items, heading: t.name, title: `${t.name} News: Latest Updates on ${t.name}`, description: `Latest news, updates and analysis on ${t.name} from ${config.name}.`, intro: `All ${config.name} coverage of ${t.name}.`, crumbs: [['Home', '/'], ['Topics', '/latest/'], [t.name, `/tag/${t.slug}/`]], indexable: t.items.length >= 3 });
  }
  // City nav links must never 404, even before any story is tagged.
  for (const [slug, name] of [['navi-mumbai', 'Navi Mumbai'], ['thane', 'Thane']]) {
    if (!tagMap.has(slug)) await listing({ base: `/tag/${slug}/`, items: [], heading: name, title: `${name} News`, description: `Latest ${name} news from ${config.name}.`, crumbs: [['Home', '/'], [name, `/tag/${slug}/`]], indexable: false });
  }
  for (const au of authors) {
    const items = articles.filter((a) => a.authors.some((x) => x.slug === au.slug));
    const profile = { '@type': 'ProfilePage', url: T.abs(`/author/${au.slug}/`), mainEntity: T.personSchema(au) };
    await listing({ base: `/author/${au.slug}/`, items, heading: au.name, title: `${au.name} — Stories & Profile`, description: truncate(au.bio, 160), intro: au.bio, crumbs: [['Home', '/'], ['Authors', '/about/#team'], [au.name, `/author/${au.slug}/`]], extraLd: [profile] });
  }

  // ---- Static pages (about, policies…) ----
  for (const file of (await fs.readdir(r('content/pages'))).filter((f) => f.endsWith('.md'))) {
    const { data: fm, content } = matter(await fs.readFile(r('content/pages', file), 'utf8'));
    const slug = fm.slug || slugify(file.replace(/\.md$/, ''));
    const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => esc(config[k] ?? ''));
    const authorsList = authors.map((au) => `- [${au.name}](/author/${au.slug}/) — ${au.role}`).join('\n');
    const body = marked.parse(fill(content).replace('{{AUTHORS}}', authorsList));
    const crumbs = [['Home', '/'], [fm.title, `/${slug}/`]];
    const html = `${T.breadcrumbHtml(crumbs)}<article class="static-page"><h1>${esc(fm.title)}</h1>${fm.updated ? `<p class="page-updated">Last updated: ${fmtDate(new Date(fm.updated))}</p>` : ''}<div class="article-body">${body}</div></article>`;
    const type = slug === 'about' ? 'AboutPage' : slug === 'contact' ? 'ContactPage' : 'WebPage';
    await writePage(`/${slug}/`, T.layout({ title: fm.seoTitle || fm.title, description: fill(fm.description || ''), path: `/${slug}/`, content: html, jsonld: [{ '@type': type, url: T.abs(`/${slug}/`), name: fm.title, isPartOf: { '@id': T.SITE_ID }, about: { '@id': T.ORG_ID } }, T.breadcrumbSchema(crumbs)] }), fm.sitemap !== false, fm.updated ? new Date(fm.updated) : buildTime);
  }

  // ---- Search page + index ----
  await writePage('/search/', T.layout({ title: 'Search', description: `Search ${config.name} news.`, path: '/search/', robots: 'noindex,follow',
    content: `<header class="listing-head"><h1>Search</h1></header><form class="search-page-form" action="/search/" method="get" role="search"><label class="sr-only" for="sp-q">Search</label><input id="sp-q" name="q" type="search" placeholder="Search news, places, people…"><button type="submit">Search</button></form><div id="search-results" class="search-results" aria-live="polite"></div>` }), false);
  await fs.writeFile(path.join(DIST, 'search-index.json'), JSON.stringify(articles.map((a) => ({ t: a.title, d: a.description, u: a.url, c: catMap[a.category].name, k: a.tags.map((t) => t.name).join(' '), p: fmtDate(a.date), i: a.img ? a.img.webp(400) : '' }))));

  // ---- 404 ----
  const notFound = T.layout({ title: 'Page not found', description: 'The page you were looking for could not be found.', path: '/404.html', robots: 'noindex,follow',
    content: `<section class="not-found"><h1>Page not found</h1><p>The story or page you were looking for has moved or does not exist.</p><p><a class="btn" href="/">Go to the homepage</a> <a class="btn btn-ghost" href="/latest/">Latest news</a></p><div class="grid-3">${articles.slice(0, 3).map((a) => T.card(a, { dek: false })).join('')}</div></section>` });
  await fs.writeFile(path.join(DIST, '404.html'), notFound);

  // ---- Sitemaps ----
  const urlset = (body, ns = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>\n${body}\n</urlset>\n`;
  const sitemaps = [];
  await fs.writeFile(path.join(DIST, 'sitemap-pages.xml'), urlset(pages.map((p) => `<url><loc>${xmlEsc(T.abs(p.path))}</loc><lastmod>${isoIST(p.lastmod)}</lastmod></url>`).join('\n')));
  sitemaps.push({ loc: '/sitemap-pages.xml', lastmod: newest });
  const byMonth = new Map();
  for (const a of articles) {
    const key = isoIST(a.date).slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(a);
  }
  const imgNs = ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
  for (const [month, list] of byMonth) {
    const name = `/sitemap-articles-${month}.xml`;
    await fs.writeFile(path.join(DIST, name), urlset(list.map((a) => `<url><loc>${xmlEsc(T.abs(a.url))}</loc><lastmod>${isoIST(a.updated || a.date)}</lastmod>${a.img ? `<image:image><image:loc>${xmlEsc(T.abs(a.img.r169))}</image:loc></image:image>` : ''}</url>`).join('\n'), imgNs));
    sitemaps.push({ loc: name, lastmod: list.reduce((m, a) => ((a.updated || a.date) > m ? (a.updated || a.date) : m), list[0].date) });
  }
  const newsCutoff = buildTime - (config.newsSitemapHours || 48) * 3600e3;
  const newsItems = articles.filter((a) => a.date >= newsCutoff).slice(0, 1000);
  await fs.writeFile(path.join(DIST, 'news-sitemap.xml'), urlset(newsItems.map((a) => `<url><loc>${xmlEsc(T.abs(a.url))}</loc><news:news><news:publication><news:name>${xmlEsc(config.name)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${isoIST(a.date)}</news:publication_date><news:title>${xmlEsc(a.title)}</news:title></news:news>${a.img ? `<image:image><image:loc>${xmlEsc(T.abs(a.img.r169))}</image:loc></image:image>` : ''}</url>`).join('\n'), ' xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"' + imgNs));
  sitemaps.push({ loc: '/news-sitemap.xml', lastmod: newest });
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.map((s) => `<sitemap><loc>${xmlEsc(T.abs(s.loc))}</loc><lastmod>${isoIST(s.lastmod)}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);

  // ---- RSS feeds (site-wide + per category) ----
  const rss = (title, link, desc, items, self) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${xmlEsc(title)}</title>
<link>${xmlEsc(link)}</link>
<description>${xmlEsc(desc)}</description>
<language>${config.language.toLowerCase()}</language>
<lastBuildDate>${buildTime.toUTCString()}</lastBuildDate>
<atom:link href="${xmlEsc(self)}" rel="self" type="application/rss+xml"/>
<image><url>${T.abs('/brand/logo-600x60.png')}</url><title>${xmlEsc(title)}</title><link>${xmlEsc(link)}</link></image>
${items.map((a) => `<item>
<title>${xmlEsc(a.title)}</title>
<link>${xmlEsc(T.abs(a.url))}</link>
<guid isPermaLink="true">${xmlEsc(T.abs(a.url))}</guid>
<pubDate>${a.date.toUTCString()}</pubDate>
<dc:creator>${xmlEsc(a.authors.map((x) => x.name).join(', '))}</dc:creator>
<category>${xmlEsc(catMap[a.category].name)}</category>
<description>${xmlEsc(a.description)}</description>
${a.img ? `<media:content url="${xmlEsc(T.abs(a.img.r169))}" medium="image" width="1200" height="675"/>` : ''}
</item>`).join('\n')}
</channel>
</rss>
`;
  await fs.writeFile(path.join(DIST, 'feed.xml'), rss(`${config.name} — Latest News`, SITE + '/', config.description, articles.slice(0, 50), T.abs('/feed.xml')));
  for (const c of categories) {
    const items = articles.filter((a) => a.category === c.slug).slice(0, 30);
    await fs.mkdir(path.join(DIST, c.slug), { recursive: true });
    await fs.writeFile(path.join(DIST, c.slug, 'feed.xml'), rss(`${config.name} — ${c.name}`, T.abs(`/${c.slug}/`), c.description, items, T.abs(`/${c.slug}/feed.xml`)));
  }

  // ---- robots.txt, manifest, IndexNow key, llms.txt, ads.txt, headers ----
  await fs.writeFile(path.join(DIST, 'robots.txt'), `# ${config.name}\nUser-agent: *\nAllow: /\nDisallow: /search/\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\nSitemap: ${SITE}/news-sitemap.xml\n`);
  await fs.writeFile(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
    name: config.name, short_name: config.shortName, description: config.description, start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#0a1f38', lang: config.language,
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
  }, null, 2));
  if (config.indexNowKey) await fs.writeFile(path.join(DIST, `${config.indexNowKey}.txt`), config.indexNowKey);
  await fs.writeFile(path.join(DIST, 'llms.txt'), `# ${config.name}\n\n> ${config.description}\n\n## Sections\n${categories.map((c) => `- [${c.name}](${T.abs(`/${c.slug}/`)}): ${c.description}`).join('\n')}\n\n## Latest stories\n${articles.slice(0, 30).map((a) => `- [${a.title}](${T.abs(a.url)}): ${a.description}`).join('\n')}\n\n## Policies\n- [About](${T.abs('/about/')})\n- [Editorial standards](${T.abs('/editorial-policy/')})\n- [Corrections](${T.abs('/corrections-policy/')})\n`);
  if (config.adsenseClient) await fs.writeFile(path.join(DIST, 'ads.txt'), `google.com, ${config.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

  // ---- Prune processed images no article uses any more ----
  const keep = new Set([...imageCache.values()].filter(Boolean).flatMap((im) => [...im.widths.map((w) => im.webp(w)), im.r169, im.r43, im.r11]).map((p) => path.basename(p)));
  for (const f of await fs.readdir(IMG_OUT)) if (!keep.has(f)) await fs.rm(path.join(IMG_OUT, f));

  if (problems.length) console.warn('\nWarnings:\n  ' + problems.join('\n  '));
  log(`Built ${articles.length} articles, ${pages.length} indexable pages in ${((Date.now() - t0) / 1000).toFixed(1)}s → dist/`);
  return { articles, config, SITE };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((e) => { console.error(e); process.exit(1); });
}
