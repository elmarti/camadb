import { ContainerModule, interfaces } from 'inversify';
import { TYPES } from '../../types';

import { SiaSerializer } from './sia-serializer';
import { ISerializer } from '../../interfaces/serializer.interface';

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
  bind<ISerializer>(TYPES.Serializer).to(SiaSerializer);
});
