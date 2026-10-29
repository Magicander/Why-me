// Usage: node scripts/set-password.js "new password"   (or ADMIN_PASSWORD=... node scripts/set-password.js)
const fs = require('fs'), path = require('path');
const { hashPassword } = require('../server.js');
const pw = process.argv[2] || process.env.ADMIN_PASSWORD;
if (!pw || pw.length < 8) { console.error('Give a password with at least 8 characters.'); process.exit(1); }
const dir = process.env.WHYME_DATA_DIR || path.join(__dirname, '..', 'data');
fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify(hashPassword(pw), null, 2), { mode: 0o600 });
try { fs.unlinkSync(path.join(dir, 'initial-admin-password.txt')); } catch {}
console.log('Admin password updated. Restart the server to drop old sessions.');
