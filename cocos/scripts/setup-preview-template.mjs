import fs from 'fs';

async function setup() {
  const res = await fetch('http://127.0.0.1:7456/');
  const html = await res.text();
  
  if (!fs.existsSync('preview-template')) {
    fs.mkdirSync('preview-template', { recursive: true });
  }

  // 确保在 preview-app bootstrap 之前执行 prerequisite-imports
  const searchStr = 'System.import("/preview-app/index.js").then(function (mod)';
  const replaceStr = 'System.import("cce:/internal/x/prerequisite-imports").then(function() { return System.import("/preview-app/index.js"); }).then(function (mod)';
  
  const enhanced = html.replace(searchStr, replaceStr);
  fs.writeFileSync('preview-template/index.ejs', enhanced, 'utf8');
  console.log('preview-template/index.ejs generated successfully! Length:', enhanced.length);
}

setup();
