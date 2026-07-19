import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ['index.html', 'styles.css', 'src']) {
  const source = path.join(root, entry);
  if (!existsSync(source)) throw new Error(`Не найден обязательный файл: ${entry}`);
  await cp(source, path.join(dist, entry), { recursive: true });
}

await writeFile(path.join(dist, '.nojekyll'), '');
console.log('Сборка готова: dist/');
