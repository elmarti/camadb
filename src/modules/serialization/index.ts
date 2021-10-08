import { ContainerModule, interfaces } from 'inversify';
import { TYPES } from '../../types';

import { FlattedSerializer } from './flatted-serializer';
import { ISerializer } from '../../interfaces/serializer.interface';

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
  bind<ISerializer>(TYPES.Serializer).to(FlattedSerializer);
});
