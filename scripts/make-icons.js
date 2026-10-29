const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  const svg = fs.readFileSync(path.join(__dirname, '../public/icons/icon.svg'), 'utf8');
  for (const s of [180, 192, 512]) { await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<style>body{margin:0}svg{width:${s}px;height:${s}px;display:block}</style>${svg}`);
    await p.screenshot({ path: path.join(__dirname, `../public/icons/icon-${s}.png`) }); }
  await b.close(); })();
