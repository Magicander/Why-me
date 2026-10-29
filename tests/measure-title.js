/* Measures the visible title lettering (white pixels) in the first screen. */
const { chromium } = require('playwright');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [w, h] of [[390, 844], [360, 740], [430, 932], [1280, 800]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(process.env.BASE || 'http://localhost:3000/'); await p.waitForTimeout(3300);
    const buf = await p.screenshot();
    const r = await p.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
      let top = -1, bot = -1, left = 1e9, right = -1;
      for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) { const k = (y * c.width + i) * 4;
        if (d[k] > 200 && d[k + 1] > 200 && d[k + 2] > 200) { if (top < 0) top = y; bot = y; if (i < left) left = i; if (i > right) right = i; } }
      return { top, bottom: bot + 1, left, right: right + 1 };
    }, 'data:image/png;base64,' + buf.toString('base64'));
    const sec = await p.evaluate(() => { const r = document.querySelector('#top').getBoundingClientRect(); return [r.top, r.height]; });
    const okv = r.top <= 2 && Math.abs(r.bottom - h) <= 2;
    if (!okv) bad++;
    console.log(`${w}x${h}: lettering top=${r.top}px bottom=${r.bottom}px (viewport ${h}) left=${r.left}px right=${r.right}px (width ${w}); section height=${sec[1]} ${okv ? 'OK' : 'FAIL'}`);
    await p.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
