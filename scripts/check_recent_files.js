import fs from 'fs';
import path from 'path';

function listRecent(dir, max = 10) {
  console.log(`\n=== Listing ${dir} ===`);
  if (!fs.existsSync(dir)) {
    console.log('Directory does not exist');
    return;
  }
  try {
    const files = fs.readdirSync(dir).map(f => {
      const p = path.join(dir, f);
      try {
        const s = fs.statSync(p);
        return { name: f, fullPath: p, mtime: s.mtime, isDir: s.isDirectory() };
      } catch {
        return null;
      }
    }).filter(Boolean);
    files.sort((a, b) => b.mtime - a.mtime);
    files.slice(0, max).forEach(f => {
      console.log(`${f.mtime.toISOString()} | ${f.isDir ? '[DIR]' : '[FILE]'} ${f.name} -> ${f.fullPath}`);
    });
  } catch (err) {
    console.error(err.message);
  }
}

listRecent('C:\\Users\\zyu33\\Downloads');
listRecent('C:\\Users\\zyu33\\.codex\\attachments');
listRecent('C:\\Users\\zyu33\\Documents\\Codex\\2026-08-28\\ji');
