import { execSync } from 'child_process';
import path from 'path';

function run(cmd) {
  console.log(`> ${cmd}`);
  const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  console.log(out);
  return out;
}

try {
  console.log('1. Adding files to git...');
  run('git add .');

  console.log('2. Committing...');
  run('git commit -m "feat: initial commit for BlackHoleRecycle project with Cocos Creator 3.8.3 and Three.js prototype"');

  console.log('3. Checking if remote origin already exists...');
  try {
    run('git remote remove origin');
  } catch {}

  console.log('4. Creating GitHub repo and pushing via gh cli...');
  // Try to create repo
  try {
    run('gh repo create BlackHoleRecycle --public --source=. --remote=origin --push');
  } catch (err) {
    console.log('gh repo create returned:', err.message);
    console.log('Attempting git push origin main directly...');
    run('git branch -M main');
    run('git push -u origin main');
  }

  console.log('\n🎉 Successfully uploaded project to GitHub!');
} catch (e) {
  console.error('Error during git push:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.error('STDERR:', e.stderr);
}
