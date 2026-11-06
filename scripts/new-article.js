// Create a new article file from the command line:
//   npm run new -- "Headline of the story" mumbai
// Then open the file in content/articles/, write the story, and run: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../src/utils.js';

const [title, category = 'mumbai'] = process.argv.slice(2);
if (!title) {
  console.log('Usage: npm run new -- "Headline of the story" [category]');
  process.exit(1);
}
const now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16);
const file = path.join('content/articles', `${now.slice(0, 10)}-${slugify(title)}.md`);
if (fs.existsSync(file)) { console.error('File already exists:', file); process.exit(1); }
fs.writeFileSync(file, `---
title: "${title.replace(/"/g, '\\"')}"
seoTitle: ""
description: "One or two sentences (120–160 characters) summarising the story for readers and Google."
category: ${category}
kicker: ""
author: mumbai-bureau
date: ${now}:00+05:30
location: Mumbai
image: ""            # file name in content/images/, e.g. my-photo.jpg (landscape, 1200px+ wide)
imageAlt: ""
imageCaption: ""
imageCredit: ""
imageLicense: ""
imageSource: ""
tags: []
featured: false      # true = homepage lead story
breaking: false      # true = breaking-news ticker
draft: true          # change to false (or delete this line) to publish
sources:
  - name: ""
    url: ""
---

First paragraph: the most important facts — who, what, where, when.

## Subheading

Supporting detail, quotes and context.
`);
console.log('Created', file);
