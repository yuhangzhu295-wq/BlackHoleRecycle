import { execSync } from 'child_process';

function run(cmd) {
  console.log(`> ${cmd}`);
  const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  console.log(out);
  return out;
}

try {
  console.log('Creating new GitHub repository: BlackHole-Recycle-3D...');
  run('gh repo create BlackHole-Recycle-3D --public --source=. --remote=new-origin --push --description "《黑洞回收站》(BlackHoleRecycle) - Cocos Creator 3.8.3 3D 跨平台小游戏工程 (微信/抖音小游戏)"');
  console.log('🎉 New repo created successfully!');
} catch (e) {
  console.log('Note:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.error('STDERR:', e.stderr);
}
