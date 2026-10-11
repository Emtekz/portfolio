// Liest Rohfotos aus images-src/<kategorie>/, verkleinert & komprimiert sie
// (WebP + JPEG, in Vorschau- und Großansicht-Größe) nach images/<kategorie>/
// und schreibt das fertige Galerie-HTML direkt in index.html zwischen den
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
const SRC_DIR = path.join(ROOT, 'images-src');
const OUT_DIR = path.join(ROOT, 'images');
const INDEX_HTML = path.join(ROOT, 'index.html');

const CATEGORIES = ['konzert', 'band', 'portrait'];
const CATEGORY_LABELS = { konzert: 'Konzert', band: 'Band', portrait: 'Portrait' };
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.svg', '.avif']);

const THUMB_WIDTH = 800;
const LARGE_WIDTH = 1920;
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
  const words = basename.replace(/[-_]+/g, ' ').trim().split(/\s+/);
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
  const srcDir = path.join(SRC_DIR, category);
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
  const srcDir = path.join(SRC_DIR, 'about');
  const outDir = path.join(OUT_DIR, 'about');
  const files = listImageFiles(srcDir);
  if (files.length === 0) return null;

  if (files.length > 1) {
    console.warn(`  Hinweis: mehrere Dateien in images-src/about/ gefunden, verwende "${files[0]}".`);
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

function buildGalleryHtml(entries) {
  if (entries.length === 0) {
    return '        <p class="gallery-empty">Noch keine Bilder vorhanden. Lege Fotos in <code>images-src/konzert</code>, <code>images-src/band</code> bzw. <code>images-src/portrait</code> ab und führe <code>npm run build:images</code> aus.</p>';
  }

  return entries.map(({ category, caption, thumb, large }) => {
    const tall = large.height / large.width > 1.15 ? ' tall' : '';
    const label = CATEGORY_LABELS[category];
    const alt = escapeHtml(caption);
    return `        <figure class="gallery-item${tall} reveal" data-category="${category}" data-large-jpg="${large.jpg}" data-large-webp="${large.webp}">
          <picture>
            <source type="image/webp" srcset="${thumb.webp}">
            <img src="${thumb.jpg}" alt="${alt}" loading="lazy" width="${thumb.width}" height="${thumb.height}">
          </picture>
          <figcaption class="gallery-overlay"><span>${label}</span><p>${alt}</p></figcaption>
        </figure>`;
  }).join('\n\n');
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

function injectBetweenMarkers(html, marker, replacement) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(html)) {
    throw new Error(`Marker ${start} / ${end} nicht in index.html gefunden.`);
  }
  return html.replace(pattern, `${start}\n${replacement}\n        ${end}`);
}

async function main() {
  console.log('Verarbeite Bilder aus images-src/ ...\n');

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

  console.log('about:');
  const about = await processAbout();
  if (!about) console.log('  (kein Bild gefunden)');
  console.log('');

  const merged = interleave(queues);
  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  html = injectBetweenMarkers(html, 'GALLERY', buildGalleryHtml(merged));
  html = injectBetweenMarkers(html, 'ABOUT', buildAboutHtml(about));
  fs.writeFileSync(INDEX_HTML, html);

  console.log(`Fertig: ${totalCount} Galerie-Bild(er) verarbeitet, index.html aktualisiert.`);
  if (totalOriginal > 0) {
    const savedPct = (100 * (1 - totalOutput / totalOriginal)).toFixed(0);
    console.log(`Größe gesamt: ${fmtKB(totalOriginal)} -> ${fmtKB(totalOutput)} (${savedPct}% kleiner)`);
  }
}

main().catch(err => {
  console.error('Fehler beim Verarbeiten der Bilder:', err);
  process.exit(1);
});
