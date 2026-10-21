const fs = require('fs');
const path = require('path');

const dir = path.join(
  __dirname,
  '../src/modules/duels/services/card-effects/effects/Monsters',
);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
const lines = [];

for (const f of files) {
  const base = f.replace(/\.ts$/, '');
  const constName = base.replace(/-/g, '_').toUpperCase() + '_KEY';
  const content =
    `/** Efeito: ${base} — effects/Monsters/${f} */\n` +
    `export const ${constName} = '${base}';\n`;
  fs.writeFileSync(path.join(dir, f), content);
  lines.push(`export { ${constName} } from './${base}';`);
}

fs.writeFileSync(path.join(dir, 'index.ts'), lines.join('\n') + '\n');
console.log('Fixed', files.length, 'monster stubs');
