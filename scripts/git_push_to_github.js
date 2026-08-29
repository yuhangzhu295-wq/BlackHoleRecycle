import { execSync } from 'child_process';

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
  run('git commit -m "fix: rebuild visible 3D scene hierarchy and mesh factory for Cocos 3.8.3 runtime"');

  console.log('3. Pushing to GitHub origin main...');
  run('git push origin main');

  console.log('\n🎉 Successfully synced all fixes to GitHub!');
} catch (e) {
  console.error('Error during git push:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.error('STDERR:', e.stderr);
}
