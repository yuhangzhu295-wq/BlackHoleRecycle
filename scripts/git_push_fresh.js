import { execSync } from 'child_process';

function run(cmd) {
  console.log(`> ${cmd}`);
  const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  console.log(out);
  return out;
}

try {
  console.log('1. Staging all modified and new assets...');
  run('git add .');

  console.log('2. Committing latest fixes...');
  try {
    run('git commit -m "feat: complete Cocos Creator 3.8.3 3D vertical slice and runtime assets"');
  } catch (err) {
    console.log('Nothing new to commit or already committed.');
  }

  console.log('3. Pushing to current GitHub repo origin main...');
  run('git push origin main');
  console.log('✅ Successfully pushed to https://github.com/yuhangzhu295-wq/BlackHoleRecycle');

} catch (e) {
  console.error('Push error:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.error('STDERR:', e.stderr);
}
