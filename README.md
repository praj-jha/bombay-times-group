# Bombay Times Group — news website

A fast, static, SEO-first news site for **bombaytimesgroup.com**. Articles are Markdown files; one command builds the whole site (HTML, responsive images, sitemaps, Google News sitemap, RSS, structured data).

## Daily use: posting an article

### Option A: the Newsroom admin (recommended)

```bash
npm run admin
```

Open **http://localhost:4321/admin**, then:

1. Click **+ New article**, write the headline, summary, section, tags and story.
2. Upload a landscape photo (1200px+ wide) and fill in **alt text** and **credit**.
3. Watch the **SEO checklist** on the right; aim for all green ticks.
4. **Save & rebuild**, then **View article** to check it.
5. **Publish live** pushes to GitHub. Your host redeploys in about a minute, and IndexNow (Bing etc.) is pinged automatically.

Tips: tick **Lead story** to put it in the homepage hero, and **Breaking** to add it to the ticker. A future date/time schedules the story. **Draft** keeps it off the site.

### Option B: by hand

```bash
npm run new -- "Headline of the story" mumbai
```

This creates `content/articles/YYYY-MM-DD-headline-of-the-story.md`. Fill in the fields, put the photo in `content/images/`, set `draft: false`, then run `npm run build`.

Sections: `mumbai, india, world, business, sports, entertainment, education, tech, lifestyle, opinion` (edit `data/categories.json`).
Authors/desks: `data/authors.json`. **Add your real reporters here** (`"type": "Person"`, with a bio and social profile links in `sameAs`). Named, real authors help Google's E-E-A-T.

## Go live (one-time, ~20 minutes)

1. **Fill in `site.config.json`**: email addresses, grievance officer, social links, `twitterHandle`. The URL is already `https://bombaytimesgroup.com`.
2. **Put the code on GitHub**:
   ```bash
   git init && git add -A && git commit -m "Launch Bombay Times Group"
   git branch -M main
   git remote add origin https://github.com/<you>/bombay-times-group.git
   git push -u origin main
   ```
3. **Connect a free host** to the repo. Either works, and both read the included config:
   - **Cloudflare Pages**: build command `npm run build`, output `dist`, env `NODE_VERSION=22`.
   - **Netlify**: auto-detected from `netlify.toml`.
4. **Point the domain** to the host (add `bombaytimesgroup.com` and `www` in the host's dashboard and follow its DNS steps). Make `www` redirect to the bare domain.

## Get indexed fast

Do these on launch day:

1. **Google Search Console** (search.google.com/search-console): add the domain property, verify (or paste the HTML-tag code into `googleSiteVerification` in `site.config.json`), then submit `https://bombaytimesgroup.com/sitemap.xml` **and** `https://bombaytimesgroup.com/news-sitemap.xml`. Use **URL Inspection → Request indexing** for the homepage and your top stories.
2. **Google Publisher Center** (publishercenter.google.com): add the publication, logo and sections (use the RSS feeds: `/feed.xml`, `/mumbai/feed.xml` …). This makes you eligible for Google News surfaces.
3. **Bing Webmaster Tools** (bing.com/webmasters): import from Search Console. IndexNow is already wired up: `npm run indexnow` (or `npm run indexnow -- --all` the first time).
4. Create the social accounts (X, Facebook, Instagram, YouTube, WhatsApp Channel) and add the links to `site.config.json`. They appear in the footer and in the Organization schema `sameAs`.
5. Publish consistently, ideally several original stories every day, and link related stories to each other.

## What's built in

- **Google News / Top Stories**: `NewsArticle` JSON-LD (headline, 16:9 + 4:3 + 1:1 images, author, publisher logo, dates in IST), `NewsMediaOrganization` with editorial, corrections, ownership and fact-checking policy links, Google News sitemap (last 48h), `max-image-preview:large` for Discover.
- **Technical SEO**: canonical URLs, clean `/section/slug/` URLs, breadcrumbs (HTML + schema), monthly article sitemaps with image tags, sitemap index, robots.txt, RSS per section, `noindex` on thin tag/empty pages and search, 404 page, `lang="en-IN"`.
- **Speed**: no framework, ~8 KB HTML gzip, responsive WebP images (400/800/1200), preloaded LCP image, fingerprinted CSS/JS with immutable caching (`public/_headers`).
- **Trust pages**: About, Editorial Standards, Corrections, Ownership & Funding, Contact, Grievance Redressal (IT Rules 2021), Privacy (DPDP Act 2023), Cookies, Terms, Advertise.
- **Brand**: deep navy `#0a1f38` + one crimson accent `#9e1b32`, Newsreader headlines and Figtree small caps. One logo system in `public/brand/` (the "B over the sea" mark, wordmark, mark + wordmark lockup in light and white versions, 600×60 publisher logo, social card, favicons). Edit the SVGs and run `node scripts/make-brand.js` to regenerate every PNG/ICO.
- **Extras**: live IST clock and Mumbai weather, dark mode, site search, share buttons, newsletter box (set `newsletterAction` to your Mailchimp/Buttondown form URL), optional Google Analytics (`googleAnalyticsId`) and AdSense (`adsenseClient`, with `ads.txt` generated automatically).

## Photos and copyright

Only use photos you shot, were given permission to use, bought from an agency, or that carry a free licence (e.g. Wikimedia Commons, Unsplash), and always fill in the credit. **Never copy photos or article text from other news sites.** Write original stories and link to your sources.

## Commands

| Command | What it does |
|---|---|
| `npm run admin` | Newsroom admin + live preview at localhost:4321 |
| `npm run serve` | Preview only |
| `npm run build` | Build the site into `dist/` |
| `npm run new -- "Title" section` | Create a new article file |
| `npm run indexnow` | Ping IndexNow with the latest URLs |
