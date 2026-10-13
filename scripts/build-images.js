// Liest Rohfotos aus Fotos/<ordner>/, verkleinert & komprimiert sie
// (WebP + JPEG, in Vorschau- und Großansicht-Größe) nach bilder-automatisch-erzeugt/<bereich>/
// und schreibt das fertige HTML in index.html (Highlights) und gallery.html zwischen den
// Markern <!-- GALLERY:START --> / <!-- GALLERY:END --> bzw.
// <!-- ABOUT:START --> / <!-- ABOUT:END -->.
//
// Ergebnis: index.html ist danach wieder eine ganz normale statische Seite
// (funktioniert per Doppelklick, kein lokaler Server, kein Extra-JS nötig).
//
// Aufruf: npm run build:images

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC_NAME = 'Fotos';
const SRC_DIR = path.join(ROOT, SRC_NAME);
const OUT_DIR = path.join(ROOT, 'bilder-automatisch-erzeugt');

// Eingabeordner je Bereich (so heißen die Ordner in Fotos).
const SRC_FOLDERS = {
  hero: 'Startseite/Hintergrund',
  highlights: 'Startseite/Highlights',
  about: 'Startseite/Ueber-mich',
  konzert: 'Galerie/Konzert',
  band: 'Galerie/Band',
  portrait: 'Galerie/Portrait',
};
const srcPath = key => `${SRC_NAME}/${SRC_FOLDERS[key]}`;
const INDEX_HTML = path.join(ROOT, 'index.html');
const GALLERY_HTML = path.join(ROOT, 'gallery.html');

const CATEGORIES = ['konzert', 'band', 'portrait'];
const CATEGORY_LABELS = { konzert: 'Konzert', band: 'Band', portrait: 'Portrait' };
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.svg', '.avif']);

const THUMB_WIDTH = 800;
const LARGE_WIDTH = 1920;
const HERO_MOBILE_WIDTH = 900;
const WEBP_QUALITY = { thumb: 75, large: 82 };
const JPG_QUALITY = { thumb: 75, large: 82 };

function listImageFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'de'));
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toCaption(basename) {
  const withoutCounter = basename.replace(/\s*\(\d+\)\s*$/, '');
  const words = withoutCounter.replace(/[-_]+/g, ' ').trim().split(/\s+/);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function renderVariant(inputPath, outBasePath, width, quality) {
  const pipeline = sharp(inputPath).rotate().resize({ width, withoutEnlargement: true });

  const webpPath = `${outBasePath}.webp`;
  const jpgPath = `${outBasePath}.jpg`;

  const webpInfo = await pipeline.clone().webp({ quality: quality.webp }).toFile(webpPath);
  const jpgInfo = await pipeline.clone().flatten({ background: '#0b0b0d' }).jpeg({ quality: quality.jpg, mozjpeg: true }).toFile(jpgPath);

  return {
    webp: path.relative(ROOT, webpPath).replace(/\\/g, '/'),
    jpg: path.relative(ROOT, jpgPath).replace(/\\/g, '/'),
    width: jpgInfo.width,
    height: jpgInfo.height,
    outBytes: webpInfo.size + jpgInfo.size,
  };
}

async function processCategory(category) {
  const srcDir = path.join(SRC_DIR, SRC_FOLDERS[category]);
  const outDir = path.join(OUT_DIR, category);
  fs.mkdirSync(outDir, { recursive: true });

  const files = listImageFiles(srcDir);
  const entries = [];
  let originalBytes = 0;
  let outputBytes = 0;

  for (const file of files) {
    const inputPath = path.join(srcDir, file);
    const basename = path.basename(file, path.extname(file));
    const id = slugify(basename) || `bild-${entries.length + 1}`;

    originalBytes += fs.statSync(inputPath).size;

    const thumb = await renderVariant(inputPath, path.join(outDir, `${id}-thumb`), THUMB_WIDTH, {
      webp: WEBP_QUALITY.thumb, jpg: JPG_QUALITY.thumb,
    });
    const large = await renderVariant(inputPath, path.join(outDir, `${id}-large`), LARGE_WIDTH, {
      webp: WEBP_QUALITY.large, jpg: JPG_QUALITY.large,
    });
    outputBytes += thumb.outBytes + large.outBytes;

    entries.push({ id, category, caption: toCaption(basename), thumb, large });

    console.log(`  ${category}/${file} -> ${id} (${fmtKB(fs.statSync(inputPath).size)} -> ${fmtKB(thumb.outBytes + large.outBytes)})`);
  }

  return { entries, originalBytes, outputBytes, count: files.length };
}

async function processAbout() {
  const srcDir = path.join(SRC_DIR, SRC_FOLDERS.about);
  const outDir = path.join(OUT_DIR, 'about');
  const files = listImageFiles(srcDir);
  if (files.length === 0) return null;

  if (files.length > 1) {
    console.warn(`  Hinweis: mehrere Dateien in ${srcPath('about')}/ gefunden, verwende "${files[0]}".`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const inputPath = path.join(srcDir, files[0]);
  const large = await renderVariant(inputPath, path.join(outDir, 'about-large'), LARGE_WIDTH, {
    webp: WEBP_QUALITY.large, jpg: JPG_QUALITY.large,
  });

  console.log(`  about/${files[0]} -> about-large (${fmtKB(fs.statSync(inputPath).size)} -> ${fmtKB(large.outBytes)})`);

  return large;
}

// Mischt die drei Kategorien reihum, statt sie hintereinander zu blocken.
function interleave(queues) {
  const merged = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      if (queue.length) {
        merged.push(queue.shift());
        added = true;
      }
    }
  }
  return merged;
}

function buildGalleryHtml(entries, emptyHint) {
  if (entries.length === 0) {
    return `        <p class="gallery-empty">Noch keine Bilder vorhanden. ${emptyHint} und führe <code>npm run build:images</code> aus.</p>`;
  }

  return entries.map(({ category, caption, thumb, large }) => {
    const tall = large.height / large.width > 1.15 ? ' tall' : '';
    const label = CATEGORY_LABELS[category];
    const labelHtml = label ? `<span>${label}</span>` : '';
    const alt = escapeHtml(caption);
    return `        <figure class="gallery-item${tall} reveal" data-category="${category}" data-large-jpg="${large.jpg}" data-large-webp="${large.webp}">
          <picture>
            <source type="image/webp" srcset="${thumb.webp}">
            <img src="${thumb.jpg}" alt="${alt}" loading="lazy" width="${thumb.width}" height="${thumb.height}">
          </picture>
          <figcaption class="gallery-overlay">${labelHtml}<p>${alt}</p></figcaption>
        </figure>`;
  }).join('\n\n');
}

function buildHeroHtml(hero) {
  if (!hero) return '';
  const { desktop, mobile } = hero;
  return `    <picture class="hero-image">
      <source media="(max-width: 720px)" type="image/webp" srcset="${mobile.webp}">
      <source media="(max-width: 720px)" srcset="${mobile.jpg}">
      <source type="image/webp" srcset="${desktop.webp}">
      <img src="${desktop.jpg}" alt="" fetchpriority="high" width="${desktop.width}" height="${desktop.height}">
    </picture>
    <div class="hero-overlay"></div>`;
}

function buildAboutHtml(about) {
  if (!about) return '        <div class="img-placeholder img-missing"></div>';
  return `        <div class="img-placeholder">
          <picture>
            <source type="image/webp" srcset="${about.webp}">
            <img src="${about.jpg}" alt="Portrait von Paul" loading="lazy" width="${about.width}" height="${about.height}">
          </picture>
        </div>`;
}

function injectBetweenMarkers(html, marker, replacement, fileName) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(html)) {
    throw new Error(`Marker ${start} / ${end} nicht in ${fileName} gefunden.`);
  }
  return html.replace(pattern, () => `${start}\n${replacement}\n        ${end}`);
}

async function processHero() {
  const srcDir = path.join(SRC_DIR, SRC_FOLDERS.hero);
  const outDir = path.join(OUT_DIR, 'hero');
  const files = listImageFiles(srcDir);
  if (files.length === 0) return null;

  if (files.length > 1) {
    console.warn(`  Hinweis: mehrere Dateien in ${srcPath('hero')}/ gefunden, verwende "${files[0]}".`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const inputPath = path.join(srcDir, files[0]);
  const quality = { webp: WEBP_QUALITY.large, jpg: JPG_QUALITY.large };
  const desktop = await renderVariant(inputPath, path.join(outDir, 'hero-large'), LARGE_WIDTH, quality);
  const mobile = await renderVariant(inputPath, path.join(outDir, 'hero-mobile'), HERO_MOBILE_WIDTH, quality);

  console.log(`  hero/${files[0]} -> hero-large, hero-mobile (${fmtKB(fs.statSync(inputPath).size)} -> ${fmtKB(desktop.outBytes + mobile.outBytes)})`);
  return { desktop, mobile };
}

async function main() {
  console.log(`Verarbeite Bilder aus ${SRC_NAME}/ ...\n`);

  const queues = [];
  let totalOriginal = 0;
  let totalOutput = 0;
  let totalCount = 0;

  for (const category of CATEGORIES) {
    console.log(`${category}:`);
    const result = await processCategory(category);
    queues.push(result.entries);
    totalOriginal += result.originalBytes;
    totalOutput += result.outputBytes;
    totalCount += result.count;
    if (result.count === 0) console.log('  (keine Bilder gefunden)');
    console.log('');
  }

  console.log('highlights:');
  const highlights = await processCategory('highlights');
  totalOriginal += highlights.originalBytes;
  totalOutput += highlights.outputBytes;
  totalCount += highlights.count;
  if (highlights.count === 0) console.log('  (keine Bilder gefunden)');
  console.log('');

  console.log('hero:');
  const hero = await processHero();
  if (!hero) console.log('  (kein Bild gefunden)');
  console.log('');

  console.log('about:');
  const about = await processAbout();
  if (!about) console.log('  (kein Bild gefunden)');
  console.log('');

  let indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
  indexHtml = injectBetweenMarkers(indexHtml, 'HIGHLIGHTS', buildGalleryHtml(highlights.entries,
    `Lege Fotos in <code>${srcPath('highlights')}</code> ab`), 'index.html');
  indexHtml = injectBetweenMarkers(indexHtml, 'HERO', buildHeroHtml(hero), 'index.html');
  indexHtml = injectBetweenMarkers(indexHtml, 'ABOUT', buildAboutHtml(about), 'index.html');
  fs.writeFileSync(INDEX_HTML, indexHtml);

  let galleryHtml = fs.readFileSync(GALLERY_HTML, 'utf8');
  galleryHtml = injectBetweenMarkers(galleryHtml, 'GALLERY', buildGalleryHtml(interleave(queues),
    `Lege Fotos in <code>${srcPath('konzert')}</code>, <code>${srcPath('band')}</code> bzw. <code>${srcPath('portrait')}</code> ab`), 'gallery.html');
  fs.writeFileSync(GALLERY_HTML, galleryHtml);

  console.log(`Fertig: ${totalCount} Bild(er) verarbeitet, index.html und gallery.html aktualisiert.`);
  if (totalOriginal > 0) {
    const savedPct = (100 * (1 - totalOutput / totalOriginal)).toFixed(0);
    console.log(`Größe gesamt: ${fmtKB(totalOriginal)} -> ${fmtKB(totalOutput)} (${savedPct}% kleiner)`);
  }
}

main().catch(err => {
  console.error('Fehler beim Verarbeiten der Bilder:', err);
  process.exit(1);
});
