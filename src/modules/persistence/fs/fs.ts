import { IFS } from '../../../interfaces/fs.interface';
import { promises as nodeFs } from 'fs';
import * as path from 'path';
import { IPagingAllocation } from '../../../interfaces/paging-allocation.interface';
import PQueue from 'p-queue';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ISerializer } from '../../../interfaces/serializer.interface';

@injectable()
export class Fs implements IFS {

  queue = new PQueue({ concurrency: 50 });

  constructor(@inject(TYPES.Serializer) private serializer: ISerializer) {}
  async writeJSON<T>(camaFolder: string, fileName: string, data: T): Promise<void> {
    const output = JSON.stringify(data, null, 2);
    if (!(await this.exists(camaFolder))) {
      await nodeFs.mkdir(camaFolder);
    }
    const filePath = path.join(camaFolder, fileName);
    await nodeFs.writeFile(`${filePath}~`, output);
    await nodeFs.rename(`${filePath}~`, `${filePath}`);
  }
  async exists(filePath: string): Promise<boolean> {
    try {
      await nodeFs.access(filePath);
      return true;
    } catch (e) {
      //Consider other functionality for access issues
      return false;
    }
  }
  async loadJSON<T>(filePath: string): Promise<T> {
    const data = (await nodeFs.readFile(filePath)).toString();
    return JSON.parse(data);
  }

  async writePages<T>(
    camaFolder: string,
    collectionName: string,
    allocations: Array<IPagingAllocation<T>>,
  ): Promise<Array<string>> {
    const filePaths: Array<string> = [];
    console.log(`writing ${allocations.length} allocations`);
    const promises = [];
    for await (const allocation of allocations) {
      console.log('adding allocation to queue', allocation.pageKey);
      promises.push(this.queue.add(() =>(async (allocation) => {
        const pageFile = path.join(camaFolder,collectionName, `${allocation.pageKey}`);
        const tempPageFile = `${pageFile}~`;
        filePaths.push(tempPageFile);
        if (!allocation.new) {
          await nodeFs.copyFile(pageFile, tempPageFile);
          const content = await nodeFs.readFile(tempPageFile);
          const deserialized = this.serializer.deserialize(content);
          deserialized.push(...allocation.rows);
          const serialized = this.serializer.serialize(deserialized);
          return await nodeFs.writeFile(tempPageFile, serialized);
        }
        const serialized = this.serializer.serialize(allocation.rows);
        console.log('writing  file', tempPageFile);
        console.time(`writing ${allocation.pageKey}`);
        await nodeFs.writeFile(tempPageFile, serialized);
        console.timeEnd(`writing ${allocation.pageKey}`);

      })(allocation) ));
    }
    await Promise.all(promises);
    return filePaths;
  }
  async commitPages(filePaths: Array<string>): Promise<void> {
    const promises = [];
    console.log('committing', filePaths);
    for await (const filePath of filePaths) {
      promises.push(this.queue.add(async () => nodeFs.rename(filePath, filePath.replace('~', ''))));
    }
    console.time('rename');
    await Promise.all(promises);
    console.timeEnd('rename');
  }
  mkdir(path: string): Promise<void> {
    return nodeFs.mkdir(path);
  }
  readDir(path: string): Promise<Array<string>> {
    return nodeFs.readdir(path);
  }

  async loadPage(file: string): Promise<any> {
    try {
      const data = await nodeFs.readFile(file);
      try{
        return this.serializer.deserialize(data);
      }
      catch (e){
        console.log('serialiser fail')
        console.error(e);
        return [];
      }
    } catch (e) {
      console.log('read fail')
      console.error(e);
      return [];
    }


  }


}
