const fs = require('fs');
const path = require('path');
const p = process.argv[2] || path.join('/app/uploads', 'bot-ai-memory.json');
if (!fs.existsSync(p)) {
  console.log('no memory file', p);
  process.exit(0);
}
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const before = (j.lessons || []).length;
const lessons = (j.lessons || []).filter((l) => !/last\s*will/i.test(String(l.label || '')));
fs.writeFileSync(p, JSON.stringify({ lessons }, null, 2));
console.log('purged last will lessons', before, '->', lessons.length);
