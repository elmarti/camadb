import { IFS } from '../../../interfaces/fs.interface';
import { promises as nodeFs } from 'fs';
import * as path from 'path';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ISerializer } from '../../../interfaces/serializer.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';
import { IQueueService } from '../../../interfaces/queue-service.interface';

@injectable()
export class Fs implements IFS {



  constructor(@inject(TYPES.Serializer) private serializer: ISerializer,
              @inject(TYPES.Logger) private logger:ILogger,
              @inject(TYPES.QueueService) private queue: IQueueService) {}

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
      await this.mkdir(camaFolder);
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
   * Overwrite the data with the updated dataset
   * @param filePaths
   */
  async commit(folderPath: string, collection:string): Promise<void> {
    this.logger.log(LogLevel.Debug, `committing`);
    this.logger.log(LogLevel.Debug, collection);
    const outputPath = path.join(folderPath, `${collection}/data~`)
    await this.queue.add(async () => nodeFs.rename(outputPath, outputPath.replace('~', '')))
  }

  /**
   * Create a directory
   * @param path - The location of the new directory
   */
  async mkdir(path: string): Promise<void> {
    await nodeFs.mkdir(path, {recursive:true});
  }

  /**
   * List all of the files within a dir
   * @param path
   */
  readDir(path: string): Promise<Array<string>> {
    return nodeFs.readdir(path);
  }



  async writeData(camaFolder: string, camaCollection: string, data: any): Promise<void> {
    const output = path.join(camaFolder, camaCollection, 'data~');
    const serialized = this.serializer.serialize(data);
    await nodeFs.writeFile(output, serialized);
  }


  async readData<T>(path: string): Promise<T> {
    const buffer = await nodeFs.readFile(path);
    return this.serializer.deserialize(buffer);
  }

  /**
   * Remove the collection dir
   *
   * @remarks This may need genericizing
   * @param outputPath - The cama folder
   * @param collectionName - The collection to be deleted
   */
  rmDir(outputPath: string, collectionName: string): Promise<void> {
    const dirPath = path.join(outputPath, collectionName);
    return nodeFs.rmdir(dirPath, {recursive:true});
  }


}
