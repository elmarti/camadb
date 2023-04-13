import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { NodeSystem } from '../node.system';
import { NoopSystem } from '../noop.system';

import { Container } from 'inversify';
import SystemModule from '../';
import { ISystem } from '../../../interfaces/system.interface';
import { TYPES } from '../../../types';



describe('SystemModule', () => {
    let container: Container;
    let camaConfig: ICamaConfig;
  
    beforeEach(() => {
      // Create a new container before each test
      container = new Container();
  
      camaConfig = {
        persistenceAdapter: PersistenceAdapterEnum.FS,
        path: './test-db',
        test: true,
      };
      container.bind<ICamaConfig>(TYPES.CamaConfig).toConstantValue(camaConfig);
    });
  
    it('should bind NodeSystem to ISystem when window is undefined', () => {
      Object.defineProperty(global, 'window', { get: jest.fn(() => undefined), configurable: true });
  
      container.load(SystemModule);
  
      const system = container.get<ISystem>(TYPES.System);
      expect(system).toBeInstanceOf(NodeSystem);
  
      Object.defineProperty(global, 'window', { get: jest.fn(() => ({})), configurable: true });
    });
  
    it('should bind NoopSystem to ISystem when window is defined', () => {
      Object.defineProperty(global, 'window', { get: jest.fn(() => ({})), configurable: true });
  
      container.load(SystemModule);
  
      const system = container.get<ISystem>(TYPES.System);
      expect(system).toBeInstanceOf(NoopSystem);
  
      Object.defineProperty(global, 'window', { get: jest.fn(() => ({})), configurable: true });
    });
  });
  

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
