import { promises as fs } from 'fs';
import * as path from 'path';

describe('public CamaDB website', () => {
  const websiteRoot = path.join(process.cwd(), 'apps/website');

  it('covers the public-site acceptance journey', async () => {
    const page = await fs.readFile(path.join(websiteRoot, 'app/page.tsx'), 'utf8');

    for (const claim of [
      'Five-minute quick start',
      'Supported scale',
      'Inspect benchmark reports',
      'Open the local knowledge lab',
      'Network by explicit choice',
    ]) {
      expect(page).toContain(claim);
    }
    expect(page).toContain('href="/demo/index.html"');
  });

  it('uses a static Next.js export and the shared design system', async () => {
    const [config, layout, manifest] = await Promise.all([
      fs.readFile(path.join(websiteRoot, 'next.config.mjs'), 'utf8'),
      fs.readFile(path.join(websiteRoot, 'app/layout.tsx'), 'utf8'),
      fs.readFile(path.join(websiteRoot, 'package.json'), 'utf8'),
    ]);

    expect(config).toContain("output: 'export'");
    expect(layout).toContain('@camadb/design/styles.css');
    expect(manifest).toContain('copy-demo.js --public');
  });
});
