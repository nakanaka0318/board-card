// src/data/changelog.js から CHANGELOG.md を生成する: npm run changelog
import { writeFileSync } from 'node:fs';
import { CHANGELOG } from '../src/data/changelog.js';

let md = '# アップデート履歴\n\nゲーム内の「📜 更新履歴」と同じ内容です (`src/data/changelog.js` から生成)。\n';
for (const v of CHANGELOG) {
  md += `\n## v${v.version} — ${v.title} (${v.date})\n\n`;
  for (const it of v.items) md += `- **${it.tag}** ${it.text}\n`;
}
writeFileSync(new URL('../CHANGELOG.md', import.meta.url), md);
console.log('CHANGELOG.md を更新しました');
