import { IFS } from '../../../interfaces/fs.interface';
import { promises as nodeFs } from 'fs';
import * as path from 'path';
import { IPagingAllocation } from '../../../interfaces/paging-allocation.interface';
import PQueue from 'p-queue';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ISerializer } from '../../../interfaces/serializer.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';

@injectable()
export class Fs implements IFS {


  queue = new PQueue({ concurrency: 50 });

  constructor(@inject(TYPES.Serializer) private serializer: ISerializer,
              @inject(TYPES.Logger) private logger:ILogger) {}

  /**
   * Write a JSON object to a file
   * @remarks
   * This method is only suitable for non-trivial payloads. Larger, more complex payloads should use the serialization library
   * @param camaFolder - The folder where the db data is stored
   * @param fileName - The name of the file to write to
   * @param data - The data to be written to the file
   */
  async writeJSON<T>(camaFolder: string, fileName: string, data: T): Promise<void> {
    this.logger.log(LogLevel.Debug, 'Writing JSON file');

    const output = JSON.stringify(data, null, 2);
    this.logger.log(LogLevel.Debug, 'Stringified JSON');
    this.logger.log(LogLevel.Debug, 'Checking if cama folder exists');
    if (!(await this.exists(camaFolder))) {
      this.logger.log(LogLevel.Debug, 'Creating cama folder');
      await nodeFs.mkdir(camaFolder);
    }
    const filePath = path.join(camaFolder, fileName);
    this.logger.log(LogLevel.Debug, 'Writing to temp file');
    await nodeFs.writeFile(`${filePath}~`, output);
    this.logger.log(LogLevel.Debug, 'Renaming temp file');
    await nodeFs.rename(`${filePath}~`, `${filePath}`);
  }

  /**
   * Check if a cfile exists
   * @param filePath - The path to the file
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await nodeFs.access(filePath);
      return true;
    } catch (e) {
      //Consider other functionality for access issues
      return false;
    }
  }

  /**
   * Load a plain old JSON object
   * @param filePath - The path to the file
   */
  async loadJSON<T>(filePath: string): Promise<T> {
    this.logger.log(LogLevel.Debug, 'Loading JSON from file');
    const data = (await nodeFs.readFile(filePath)).toString();
    return JSON.parse(data);
  }


  /**
   * Write a collection to pages
   * @param camaFolder - The DB storage folder
   * @param collectionName - The name of the collection
   * @param allocations - The pages into which the rows will be allocated
   */
  async writePages<T>(
    camaFolder: string,
    collectionName: string,
    allocations: Array<IPagingAllocation<T>>,
  ): Promise<Array<string>> {
    const filePaths: Array<string> = [];
    this.logger.log(LogLevel.Debug, `writing ${allocations.length} allocations`);
    const promises = [];
    for await (const allocation of allocations) {
      this.logger.log(LogLevel.Debug, 'adding allocation to queue: '+allocation.pageKey);

      promises.push(this.queue.add(() =>(async (allocation) => {
        const pageFile = path.join(camaFolder,collectionName, `${allocation.pageKey}`);
        const tempPageFile = `${pageFile}~`;
        filePaths.push(tempPageFile);
        if (!allocation.new) {
          this.logger.log(LogLevel.Debug, 'Handling old allocation');
          this.logger.log(LogLevel.Debug, 'Copying page to temp file');
          await nodeFs.copyFile(pageFile, tempPageFile);
          this.logger.log(LogLevel.Debug, 'Reading copied field');
          const content = await nodeFs.readFile(tempPageFile);
          this.logger.log(LogLevel.Debug, 'Deserializing file');
          const deserializationPointer = this.logger.startTimer();
          const deserialized = this.serializer.deserialize(content);
          this.logger.endTimer(LogLevel.Perf, deserializationPointer, 'deserialization');
          this.logger.log(LogLevel.Debug, 'Adding new rows');
          deserialized.push(...allocation.rows);
          this.logger.log(LogLevel.Debug, 'Reserializing');
          const reserializationPointer = this.logger.startTimer();
          const serialized = this.serializer.serialize(deserialized);
          this.logger.endTimer(LogLevel.Perf, reserializationPointer, 'reserialization');
          this.logger.log(LogLevel.Debug, 'Writing to temp file');
          return await nodeFs.writeFile(tempPageFile, serialized);
        } else {
          this.logger.log(LogLevel.Debug, 'Handling new allocation');
          this.logger.log(LogLevel.Debug, 'Serializing allocation');
          const serializationPointer = this.logger.startTimer();
          const serialized = this.serializer.serialize(allocation.rows);
          this.logger.endTimer(LogLevel.Perf, serializationPointer, 'serialization');
          this.logger.log(LogLevel.Debug, 'Writing to file');

          const writingPointer = this.logger.startTimer();
          await nodeFs.writeFile(tempPageFile, serialized);
          this.logger.endTimer(LogLevel.Perf, writingPointer, 'writing to file');
        }

      })(allocation) ));
    }
    await Promise.all(promises);
    return filePaths;
  }

  /**
   * Overwrite the main pages with the updated ones
   * @param filePaths
   */
  async commitPages(filePaths: Array<string>): Promise<void> {
    const promises = [];
    this.logger.log(LogLevel.Debug, `committing ${filePaths.length} pages`);
    this.logger.log(LogLevel.Debug, filePaths);

    for await (const filePath of filePaths) {
      promises.push(this.queue.add(async () => nodeFs.rename(filePath, filePath.replace('~', ''))));
    }
    console.time('rename');
    await Promise.all(promises);
    console.timeEnd('rename');
  }

  /**
   * Create a directory
   * @param path - The location of the new directory
   */
  mkdir(path: string): Promise<void> {
    return nodeFs.mkdir(path);
  }

  /**
   * List all of the files within a dir
   * @param path
   */
  readDir(path: string): Promise<Array<string>> {
    return nodeFs.readdir(path);
  }

  /**
   * Load and deserialize a page
   * @param file - the path of the file
   */
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

  async writePage(page:string, camaFolder: string, camaCollection: string, data: any): Promise<void> {
    const output = path.join(camaFolder, camaCollection, page);
    const serialized = this.serializer.serialize(data);
    await nodeFs.writeFile(output, serialized);
  }



}
