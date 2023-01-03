import { ContainerModule, interfaces } from 'inversify';
import { ISystem } from '../../interfaces/system.interface';
import { TYPES } from '../../types';
import { NodeSystem } from './node.system';
import { NoopSystem } from './noop.system';


export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
    //TODO:  a better way of identifying node environment 
    //@ts-ignore
    if(typeof window === 'undefined'){
        bind<ISystem>(TYPES.System).to(NodeSystem).inSingletonScope();
    } else {
        bind<ISystem>(TYPES.System).to(NoopSystem).inSingletonScope();
    }
});
