import { promises as fs } from 'fs';
import * as path from 'path';

describe('CamaDB design system', () => {
  it('provides portable semantic foundations for every product surface', async () => {
    const designRoot = path.join(process.cwd(), 'packages/design');
    const [tokens, foundations, components] = await Promise.all([
      fs.readFile(path.join(designRoot, 'src/tokens.css'), 'utf8'),
      fs.readFile(path.join(designRoot, 'src/foundations.css'), 'utf8'),
      fs.readFile(path.join(designRoot, 'src/components.css'), 'utf8'),
    ]);

    for (const token of [
      '--cama-color-brand',
      '--cama-color-accent',
      '--cama-font-display',
      '--cama-space-8',
      '--cama-focus',
      '--cama-motion-base',
    ]) {
      expect(tokens).toContain(token);
    }
    expect(foundations).toContain('prefers-reduced-motion');
    expect(foundations).toContain('.cama-skip-link');
    expect(components).toContain('.cama-button');
    expect(components).toContain('.cama-field');
  });
});
