// HTML templates. Every page is server-rendered static HTML so Googlebot sees the full content on first fetch.
import { esc, fmtDate, fmtTime, fmtDateTime, fmtWeekdayDate, isoIST, truncate } from './utils.js';

export function createTemplates(ctx) {
  const { config, SITE, categories, catMap, authorMap, assets, buildTime } = ctx;
  const abs = (p = '/') => (p.startsWith('http') ? p : SITE + p);
  const json = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
  const ORG_ID = `${SITE}/#organization`;
  const SITE_ID = `${SITE}/#website`;
  const navCats = categories.filter((c) => c.nav);
  const HERO_SIZES = '(max-width: 1100px) 100vw, 620px';

  // ---------- Images ----------
  function picture(a, { sizes = '(max-width: 700px) 100vw, 33vw', eager = false, cls = '' } = {}) {
    const im = a.img;
    if (!im) return '';
    const srcset = im.widths.map((w) => `${im.webp(w)} ${w}w`).join(', ');
    const mid = im.widths.includes(800) ? 800 : im.widths[im.widths.length - 1];
    return `<img${cls ? ` class="${cls}"` : ''} src="${im.webp(mid)}" srcset="${srcset}" sizes="${sizes}" width="1200" height="675" alt="${esc(a.imageAlt || a.title)}"${eager ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"'}>`;
  }

  function authorLinks(a) {
    return a.authors.map((au) => `<a href="/author/${au.slug}/" rel="author">${esc(au.name)}</a>`).join(', ');
  }

  // ---------- Cards ----------
  function card(a, { variant = 'std', dek = true, eager = false, sizes } = {}) {
    const cat = catMap[a.category];
    const kicker = `<div class="kicker"><a href="/${cat.slug}/">${esc(a.kicker || cat.name)}</a></div>`;
    const meta = `<div class="meta"><span>${esc(a.authors[0].name)}</span><span aria-hidden="true">·</span><time datetime="${isoIST(a.date)}">${fmtTime(a.date)}</time><span aria-hidden="true">·</span><span>${a.minutes} min read</span></div>`;
    if (variant === 'hero') {
      return `<article class="card hero-main">
  ${a.img ? `<figure class="thumb"><a href="${a.url}" tabindex="-1" aria-hidden="true">${picture(a, { eager, sizes: HERO_SIZES })}</a></figure>` : ''}
  <div class="kicker"><a href="/${cat.slug}/">Lead Story · ${esc(cat.name)}</a></div>
  <h2 class="hero-title"><a href="${a.url}">${esc(a.title)}</a></h2>
  <p class="dek">${esc(a.description)}</p>
  ${meta}
</article>`;
    }
    if (variant === 'thumb') {
      return `<article class="card with-thumb">
  <div>${kicker}<h3><a href="${a.url}">${esc(a.title)}</a></h3><div class="meta"><time datetime="${isoIST(a.date)}">${fmtTime(a.date)}</time></div></div>
  ${a.img ? `<figure class="thumb"><a href="${a.url}" tabindex="-1" aria-hidden="true">${picture(a, { sizes: '120px' })}</a></figure>` : ''}
</article>`;
    }
    if (variant === 'text') {
      return `<article class="card text-only">${kicker}<h3><a href="${a.url}">${esc(a.title)}</a></h3>${dek ? `<p class="dek">${esc(truncate(a.description, 140))}</p>` : ''}${meta}</article>`;
    }
    return `<article class="card">
  ${a.img ? `<figure class="thumb"><a href="${a.url}" tabindex="-1" aria-hidden="true">${picture(a, { sizes: sizes || '(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 300px' })}</a></figure>` : ''}
  ${kicker}
  <h3><a href="${a.url}">${esc(a.title)}</a></h3>
  ${dek ? `<p class="dek">${esc(truncate(a.description, 150))}</p>` : ''}
  ${meta}
</article>`;
  }

  // ---------- Rail (sidebar) ----------
  function rail({ latest = [], top = [] }) {
    const latestHtml = latest.length ? `<section class="rail-box" aria-labelledby="rail-latest">
  <h2 class="rail-title" id="rail-latest">Latest News</h2>
  <ul class="latest-list">${latest.map((a) => `<li><time datetime="${isoIST(a.date)}">${fmtTime(a.date)}</time><a href="${a.url}">${esc(a.title)}</a></li>`).join('')}</ul>
  <a class="more" href="/latest/">All latest news →</a>
</section>` : '';
    const topHtml = top.length ? `<section class="rail-box" aria-labelledby="rail-top">
  <h2 class="rail-title" id="rail-top">Top Stories</h2>
  <ol class="mostread">${top.map((a) => `<li><a href="${a.url}">${esc(a.title)}</a></li>`).join('')}</ol>
</section>` : '';
    return `<aside class="rail" aria-label="Sidebar">${latestHtml}${topHtml}${newsletterBox()}${followBox()}</aside>`;
  }

  function newsletterBox() {
    return `<section class="rail-box newsletter" id="newsletter" aria-labelledby="nl-title">
  <h2 class="rail-title" id="nl-title">The Morning Briefing</h2>
  <p>Mumbai's top stories in your inbox before your first local train. Free, every weekday.</p>
  <form class="nl-form" action="${esc(config.newsletterAction || '#')}" method="post" data-fallback="${esc(config.email)}">
    <label class="sr-only" for="nl-email">Email address</label>
    <input id="nl-email" type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <button type="submit">Sign Up</button>
  </form>
</section>`;
  }

  function socialLinks() {
    const s = config.social || {};
    const items = [
      ['whatsappChannel', 'WhatsApp Channel'], ['x', 'X (Twitter)'], ['facebook', 'Facebook'],
      ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'],
    ].filter(([k]) => s[k]);
    return [...items.map(([k, label]) => `<a href="${esc(s[k])}" rel="noopener me" target="_blank">${label}</a>`), '<a href="/feed.xml">RSS Feed</a>'];
  }

  function followBox() {
    return `<section class="rail-box"><h2 class="rail-title">Follow Bombay Times Group</h2><div class="follow-links">${socialLinks().join('')}</div></section>`;
  }

  // ---------- Header / Footer ----------
  function header(activeSlug = '', ticker = []) {
    const tickerHtml = ticker.length ? `<div class="ticker" role="region" aria-label="Breaking news">
  <div class="wrap">
    <span class="ticker-label">Breaking</span>
    <div class="ticker-track-outer"><div class="ticker-track">${[...ticker, ...ticker].map((a, i) => `<a href="${a.url}"${i >= ticker.length ? ' aria-hidden="true" tabindex="-1"' : ''}>${esc(a.title)}</a>`).join('')}</div></div>
  </div>
</div>` : '';
    return `<a class="skip-link" href="#main">Skip to content</a>
<header class="masthead">
  <div class="wrap masthead-inner">
    <div class="brand">
      <a href="/" class="logo" aria-label="${esc(config.name)} — Home"><img src="/brand/logo-lockup-white.svg" width="328" height="40" alt="${esc(config.name)}"></a>
      <div class="tagline">${esc(config.tagline)} <span>· ${esc(config.edition)}</span></div>
    </div>
    <div class="mast-right">
      <div class="dateline">
        <span id="today-date">${fmtWeekdayDate(buildTime)}</span>
        <span class="dot" aria-hidden="true"></span>
        <span id="ist-clock" aria-live="off"></span>
        <span class="dot" aria-hidden="true"></span>
        <span id="weather">Mumbai</span>
      </div>
      <div class="tools">
        <button class="iconbtn" type="button" data-action="search" title="Search" aria-label="Search">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button class="iconbtn" type="button" data-action="theme" title="Toggle dark mode" aria-label="Toggle dark mode">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor"/></svg>
        </button>
        <a class="btn-subscribe" href="#newsletter">Subscribe</a>
      </div>
    </div>
  </div>
</header>
<nav class="mainnav" aria-label="Main">
  <div class="wrap">
    <a class="nav-brand" href="/" aria-label="${esc(config.name)} — Home"><img src="/brand/logo-mark.svg" width="30" height="30" alt=""></a>
    <a href="/"${activeSlug === 'home' ? ' class="active" aria-current="page"' : ''}>Home</a>
    <a href="/latest/" class="nav-live${activeSlug === 'latest' ? ' active" aria-current="page' : ''}">Latest</a>
    ${navCats.map((c) => `<a href="/${c.slug}/"${activeSlug === c.slug ? ' class="active" aria-current="page"' : ''}>${esc(c.name)}</a>`).join('\n    ')}
    <a href="/tag/navi-mumbai/">Navi Mumbai</a>
    <a href="/tag/thane/">Thane</a>
  </div>
</nav>
${tickerHtml}`;
  }

  function footer() {
    const year = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(buildTime);
    return `<footer class="site-footer">
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <a href="/" class="logo" aria-label="${esc(config.name)} — Home"><img src="/brand/logo-lockup-white.svg" width="300" height="37" alt="${esc(config.name)}" loading="lazy"></a>
      <p class="fb-tag">${esc(config.tagline)}</p>
      <p class="about">${esc(config.name)} is an independent digital newsroom based in Mumbai, reporting on the city, Maharashtra, India and the world. We verify before we publish, credit our sources and correct our mistakes in the open.</p>
    </div>
    <div>
      <h2>Sections</h2>
      <ul>${navCats.map((c) => `<li><a href="/${c.slug}/">${esc(c.name)}</a></li>`).join('')}<li><a href="/latest/">Latest News</a></li></ul>
    </div>
    <div>
      <h2>Company</h2>
      <ul>
        <li><a href="/about/">About Us</a></li>
        <li><a href="/editorial-policy/">Editorial Standards</a></li>
        <li><a href="/corrections-policy/">Corrections Policy</a></li>
        <li><a href="/ownership-and-funding/">Ownership &amp; Funding</a></li>
        <li><a href="/advertise/">Advertise</a></li>
        <li><a href="/contact/">Contact Us</a></li>
      </ul>
    </div>
    <div>
      <h2>Follow</h2>
      <ul>${socialLinks().map((l) => `<li>${l}</li>`).join('')}<li><a href="/sitemap.xml">Sitemap</a></li></ul>
    </div>
  </div>
  <div class="wrap foot-bottom">
    <span>© ${year} ${esc(config.name)}. All rights reserved.</span>
    <span class="foot-links"><a href="/privacy-policy/">Privacy Policy</a><a href="/terms-of-use/">Terms of Use</a><a href="/cookie-policy/">Cookie Policy</a><a href="/grievance-redressal/">Grievance Redressal</a></span>
  </div>
</footer>
<div class="search-overlay" id="search-overlay" hidden>
  <form class="search-box" action="/search/" method="get" role="search">
    <label class="sr-only" for="search-q">Search news</label>
    <input id="search-q" name="q" type="search" placeholder="Search Bombay Times Group…" autocomplete="off">
    <button type="submit">Search</button>
    <button type="button" class="search-close" data-action="search-close" aria-label="Close search">✕</button>
  </form>
</div>`;
  }

  // ---------- Structured data ----------
  function orgSchema() {
    const s = config.social || {};
    const sameAs = Object.values(s).filter(Boolean);
    const address = Object.fromEntries(Object.entries(config.address || {}).filter(([, v]) => v));
    return {
      '@type': 'NewsMediaOrganization',
      '@id': ORG_ID,
      name: config.name,
      alternateName: config.shortName,
      url: SITE + '/',
      logo: { '@type': 'ImageObject', '@id': `${SITE}/#logo`, url: abs('/brand/logo-square-512.png'), width: 512, height: 512, caption: config.name },
      image: { '@id': `${SITE}/#logo` },
      description: config.description,
      foundingDate: config.foundingDate,
      ...(sameAs.length ? { sameAs } : {}),
      address: { '@type': 'PostalAddress', ...address },
      email: config.email,
      contactPoint: [
        { '@type': 'ContactPoint', contactType: 'newsroom', email: config.email, areaServed: 'IN', availableLanguage: ['en', 'hi', 'mr'] },
        { '@type': 'ContactPoint', contactType: 'customer support', email: config.grievanceEmail, areaServed: 'IN' },
      ],
      publishingPrinciples: abs('/editorial-policy/'),
      ethicsPolicy: abs('/editorial-policy/'),
      correctionsPolicy: abs('/corrections-policy/'),
      verificationFactCheckingPolicy: abs('/editorial-policy/#verification'),
      actionableFeedbackPolicy: abs('/contact/'),
      ownershipFundingInfo: abs('/ownership-and-funding/'),
      masthead: abs('/about/#team'),
      noBylinesPolicy: abs('/editorial-policy/#bylines'),
    };
  }

  function websiteSchema() {
    return { '@type': 'WebSite', '@id': SITE_ID, url: SITE + '/', name: config.name, alternateName: config.shortName, inLanguage: config.language, publisher: { '@id': ORG_ID } };
  }

  function breadcrumbSchema(items) {
    return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) })) };
  }

  function breadcrumbHtml(items) {
    return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>${items.map(([name, url], i) => i === items.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${url}">${esc(name)}</a></li>`).join('')}</ol></nav>`;
  }

  function personSchema(au) {
    return {
      '@type': au.type === 'Person' ? 'Person' : 'Organization',
      name: au.name,
      url: abs(`/author/${au.slug}/`),
      ...(au.type !== 'Person' ? { parentOrganization: { '@id': ORG_ID } } : { worksFor: { '@id': ORG_ID } }),
      ...(au.jobTitle ? { jobTitle: au.jobTitle } : {}),
      ...(au.sameAs && au.sameAs.length ? { sameAs: au.sameAs } : {}),
    };
  }

  function articleSchema(a) {
    const images = a.img ? [abs(a.img.r169), abs(a.img.r43), abs(a.img.r11)] : [abs('/og-default.jpg')];
    return {
      '@type': 'NewsArticle',
      '@id': abs(a.url) + '#article',
      mainEntityOfPage: { '@type': 'WebPage', '@id': abs(a.url) },
      url: abs(a.url),
      headline: truncate(a.title, 110),
      description: a.description,
      image: images,
      thumbnailUrl: images[0],
      datePublished: isoIST(a.date),
      dateModified: isoIST(a.updated || a.date),
      author: a.authors.map(personSchema),
      publisher: { '@id': ORG_ID },
      articleSection: catMap[a.category].name,
      keywords: a.tags.join(', '),
      inLanguage: config.language,
      isAccessibleForFree: true,
      wordCount: a.words,
      ...(a.location ? { contentLocation: { '@type': 'Place', name: a.location } } : {}),
      ...(a.sources.length ? { citation: a.sources.map((s) => ({ '@type': 'CreativeWork', name: s.name, ...(s.url ? { url: s.url } : {}) })) } : {}),
      isPartOf: { '@id': SITE_ID },
    };
  }

  // ---------- Layout ----------
  function layout({ title, description, path, content, ogImage, ogImageAlt, ogType = 'website', jsonld = [], robots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1', active = '', ticker = [], extraHead = '', preload = '', fullTitle = false }) {
    // Google shows ~60 characters; fall back to the short brand so the headline isn't cut off.
    const pageTitle = fullTitle ? title : (title.length + config.name.length + 3 <= 70 ? `${title} | ${config.name}` : `${title} | ${config.shortName}`);
    const canonical = abs(path);
    const img = abs(ogImage || '/og-default.jpg');
    const graph = { '@context': 'https://schema.org', '@graph': [orgSchema(), websiteSchema(), ...jsonld] };
    const verify = [
      config.googleSiteVerification && `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">`,
      config.bingSiteVerification && `<meta name="msvalidate.01" content="${esc(config.bingSiteVerification)}">`,
    ].filter(Boolean).join('\n');
    const ga = config.googleAnalyticsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(config.googleAnalyticsId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(config.googleAnalyticsId)}');</script>` : '';
    const ads = config.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsenseClient)}" crossorigin="anonymous"></script>` : '';
    return `<!DOCTYPE html>
<html lang="${config.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta name="googlebot-news" content="${robots.startsWith('noindex') ? 'noindex' : 'index,follow'}">
<meta property="og:site_name" content="${esc(config.name)}">
<meta property="og:locale" content="${config.locale}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="${ogImage && ogImage.includes('1200x675') ? 675 : 630}">
<meta property="og:image:alt" content="${esc(ogImageAlt || config.name)}">
<meta name="twitter:card" content="summary_large_image">
${config.twitterHandle ? `<meta name="twitter:site" content="${esc(config.twitterHandle)}">\n` : ''}<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
${extraHead}
${verify}
<meta name="theme-color" content="#0a1f38">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${esc(config.name)} — Latest News" href="${abs('/feed.xml')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${preload}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">
<link rel="stylesheet" href="${assets.css}">
<script>try{var t=localStorage.getItem('btg-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<script type="application/ld+json">${json(graph)}</script>
${ga}
${ads}
</head>
<body>
${header(active, ticker)}
<main id="main" class="wrap">
${content}
</main>
${footer()}
<script src="${assets.js}" defer></script>
</body>
</html>`;
  }

  // ---------- Page bodies ----------
  function articleBody(a, { related = [], latest = [], top = [] }) {
    const cat = catMap[a.category];
    const crumbs = [['Home', '/'], [cat.name, `/${cat.slug}/`], [a.title, a.url]];
    const shareUrl = encodeURIComponent(abs(a.url));
    const shareText = encodeURIComponent(a.title);
    const updated = a.updated && a.updated - a.date > 60000;
    const credit = [a.imageCredit, a.imageLicense].filter(Boolean).join(' · ');
    const html = `${breadcrumbHtml(crumbs)}
<div class="with-rail article-layout">
<article class="article">
  <header class="article-head">
    <div class="kicker"><a href="/${cat.slug}/">${esc(a.kicker || cat.name)}</a></div>
    <h1>${esc(a.title)}</h1>
    <p class="standfirst">${esc(a.description)}</p>
    <div class="byline">
      <span>By ${authorLinks(a)}</span>
      <span class="bl-sep" aria-hidden="true">|</span>
      ${a.location ? `<span>${esc(a.location)}</span><span class="bl-sep" aria-hidden="true">|</span>` : ''}
      <span>Published <time datetime="${isoIST(a.date)}">${fmtDateTime(a.date)}</time></span>
      ${updated ? `<span class="bl-sep" aria-hidden="true">|</span><span>Updated <time datetime="${isoIST(a.updated)}">${fmtDateTime(a.updated)}</time></span>` : ''}
      <span class="bl-sep" aria-hidden="true">|</span>
      <span>${a.minutes} min read</span>
    </div>
    <div class="share" aria-label="Share this story">
      <a class="sh-wa" href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="sh-x" href="https://twitter.com/intent/tweet?text=${shareText}&amp;url=${shareUrl}" target="_blank" rel="noopener">X</a>
      <a class="sh-fb" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener">Facebook</a>
      <a class="sh-li" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener">LinkedIn</a>
      <button type="button" class="sh-copy" data-action="copy" data-url="${abs(a.url)}">Copy link</button>
    </div>
  </header>
  ${a.img ? `<figure class="article-figure">
    ${picture(a, { eager: true, sizes: '(max-width: 900px) 100vw, 800px' })}
    ${a.imageCaption || credit ? `<figcaption>${esc(a.imageCaption || '')}${credit ? ` <span class="credit">Photo: ${a.imageSource ? `<a href="${esc(a.imageSource)}" target="_blank" rel="noopener">${esc(credit)}</a>` : esc(credit)}</span>` : ''}</figcaption>` : ''}
  </figure>` : ''}
  <div class="article-body">
${a.html}
  </div>
  ${a.sources.length ? `<aside class="sources"><h2>Sources &amp; references</h2><ul>${a.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.name)}</a>` : esc(s.name)}${s.note ? ` — ${esc(s.note)}` : ''}</li>`).join('')}</ul></aside>` : ''}
  ${a.tags.length ? `<div class="tags"><span>Topics:</span>${a.tags.map((t) => `<a href="/tag/${t.slug}/" rel="tag">${esc(t.name)}</a>`).join('')}</div>` : ''}
  ${a.authors.map((au) => `<div class="author-box"><div class="ab-mark" aria-hidden="true"><img src="${esc(au.image || '/brand/logo-mark.svg')}" alt="" width="56" height="56" loading="lazy"></div><div><a class="ab-name" href="/author/${au.slug}/">${esc(au.name)}</a><p>${esc(au.bio)}</p></div></div>`).join('')}
  <p class="corrections-note">Spotted an error? <a href="/corrections-policy/">Read our corrections policy</a> or write to <a href="mailto:${esc(config.email)}">${esc(config.email)}</a>.</p>
</article>
${rail({ latest, top })}
</div>
${related.length ? `<section class="home-section related" aria-labelledby="related-h">
  <div class="section-head"><h2 id="related-h">More from ${esc(cat.name)}</h2><a class="more" href="/${cat.slug}/">All ${esc(cat.name)} News →</a></div>
  <div class="grid-4">${related.map((r) => card(r, { dek: false })).join('')}</div>
</section>` : ''}`;
    return { html, crumbs };
  }

  function listingBody({ heading, intro, items, latest, top, pagination, crumbs, lead = true }) {
    const [first, ...rest] = items;
    const body = items.length
      ? `${lead && first ? `<div class="listing-lead">${card(first, { variant: 'hero', eager: true })}</div>` : ''}
<div class="grid-3">${(lead ? rest : items).map((a) => card(a)).join('')}</div>`
      : `<p class="empty">No stories have been published here yet. <a href="/latest/">Read the latest news →</a></p>`;
    return `${breadcrumbHtml(crumbs)}
<header class="listing-head"><h1>${esc(heading)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}</header>
<div class="with-rail">
  <div>${body}${pagination || ''}</div>
  ${rail({ latest, top })}
</div>`;
  }

  function paginationHtml(base, page, pages) {
    if (pages <= 1) return '';
    const href = (n) => (n === 1 ? base : `${base}page/${n}/`);
    const links = [];
    if (page > 1) links.push(`<a rel="prev" href="${href(page - 1)}">← Newer</a>`);
    for (let n = 1; n <= pages; n++) links.push(n === page ? `<span aria-current="page">${n}</span>` : `<a href="${href(n)}">${n}</a>`);
    if (page < pages) links.push(`<a rel="next" href="${href(page + 1)}">Older →</a>`);
    return `<nav class="pagination" aria-label="Pagination">${links.join('')}</nav>`;
  }

  return { HERO_SIZES, abs, card, rail, layout, articleBody, listingBody, paginationHtml, breadcrumbHtml, breadcrumbSchema, articleSchema, personSchema, picture, ORG_ID, SITE_ID };
}
