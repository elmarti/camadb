import { ContainerModule, interfaces } from 'inversify';
import { TYPES } from '../../types';
import { IIndexer } from '../../interfaces/indexer.interface';
import { CamaIndexer } from './cama.indexer';
import { FullTextIndexer } from './full-text.indexer';


export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
  bind<IIndexer>(TYPES.CamaIndexer).to(CamaIndexer);
  bind<IIndexer>(TYPES.FullTextIndexer).to(FullTextIndexer);

});
