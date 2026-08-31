import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { NodeSystem } from '../node.system';
import { NoopSystem } from '../noop.system';

describe('NodeSystem', () => {
  let camaConfig: ICamaConfig;

  beforeEach(() => {
    camaConfig = {
        persistenceAdapter: PersistenceAdapterEnum.FS,
      path: './test-db',
      test: true
    };
  });

  it('should return the output path from the config', () => {
    const nodeSystem = new NodeSystem(camaConfig);
    const outputPath = nodeSystem.getOutputPath();
    expect(outputPath).toBe('./test-db');
  });

  it('should return the default output path when no path is provided', () => {
    camaConfig.path = undefined;
    const nodeSystem = new NodeSystem(camaConfig);
    const outputPath = nodeSystem.getOutputPath();
    expect(outputPath).toMatch(/^.+\/\.cama$/);
  });
});

describe('NoopSystem', () => {
  let camaConfig: ICamaConfig;

  beforeEach(() => {
    camaConfig = {
        persistenceAdapter: PersistenceAdapterEnum.FS,
      path: 'noop',
      test: true
    };
  });

  it('should always return "noop" as the output path', () => {
    const noopSystem = new NoopSystem(camaConfig);
    const outputPath = noopSystem.getOutputPath();
    expect(outputPath).toBe('noop');
  });
});
