"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const record_pages_1 = require("../../packages/core/dist/modules/persistence/record-pages");
const compaction_1 = require("../../packages/core/dist/modules/persistence/compaction");
const emptyManifest = () => ({
    incarnation: `${Date.now()}-${Math.random()}`,
    camaDB: { format: 'records', version: 3 },
    generation: 0,
    nextSequence: 0,
    shards: {},
});
const emptyShard = () => ({ records: {}, tombstones: {} });
/** Superseded immutable-page implementation retained until segment rollout is complete. */
class FSPersistence {
    constructor(config, collectionMeta, fs, logger, collectionName, system, queue) {
        this.config = config;
        this.collectionMeta = collectionMeta;
        this.fs = fs;
        this.logger = logger;
        this.collectionName = collectionName;
        this.system = system;
        this.queue = queue;
        this.destroyed = false;
        this.compactionDebt = Infinity;
        this.collectionPath = path.join(this.system.getOutputPath(), this.collectionName);
        this.pagesPath = path.join(this.collectionPath, 'pages');
        this.shardsPath = path.join(this.collectionPath, 'shards');
        this.manifestPath = path.join(this.collectionPath, 'manifest.json');
        const existingQueue = FSPersistence.writers.get(this.collectionPath);
        if (existingQueue)
            this.queue = existingQueue;
        else
            FSPersistence.writers.set(this.collectionPath, this.queue);
        this.initialized = this.queue.add(() => this.initialize());
    }
    async insert(rows) {
        await this.mutateRecords({ puts: rows });
    }
    async getData() {
        const rows = [];
        for await (const row of this.iterateRecords())
            rows.push(row);
        return rows;
    }
    async getRecord(id) {
        return (await this.getRecords([id])).get(id);
    }
    async cacheRevision() {
        this.checkDestroyed();
        await this.initialized;
        const manifest = await this.readManifest();
        return manifest.incarnation ? `${manifest.incarnation}:${manifest.generation}` : JSON.stringify(manifest);
    }
    async getRecords(ids) {
        this.pinReader(1);
        try {
            return await this.readRecordsSnapshot(ids);
        }
        finally {
            this.pinReader(-1);
        }
    }
    async readRecordsSnapshot(ids) {
        this.checkDestroyed();
        await this.initialized;
        const manifest = await this.readManifest();
        const shards = new Map();
        const pages = new Map();
        const result = new Map();
        for (const id of ids) {
            const shardKey = this.shardKey(id);
            let shard = shards.get(shardKey);
            if (!shard) {
                shard = await this.readShard(manifest, shardKey);
                shards.set(shardKey, shard);
            }
            const location = shard.records[id];
            if (!location)
                continue;
            let page = pages.get(location.page);
            if (!page) {
                page = await this.readPage(location.page);
                pages.set(location.page, page);
            }
            result.set(id, page[location.index]);
        }
        return result;
    }
    async *iterateRecords() {
        this.pinReader(1);
        try {
            yield* this.iterateSnapshot();
        }
        finally {
            this.pinReader(-1);
        }
    }
    async *iterateSnapshot() {
        this.checkDestroyed();
        await this.initialized;
        const manifest = await this.readManifest();
        const locations = [];
        for (const shardFile of Object.values(manifest.shards)) {
            locations.push(...Object.values((await this.fs.loadJSON(path.join(this.shardsPath, shardFile))).records));
        }
        locations.sort((left, right) => left.sequence - right.sequence);
        let loadedPage;
        let page = [];
        for (const location of locations) {
            if (loadedPage !== location.page) {
                loadedPage = location.page;
                page = await this.readPage(location.page);
            }
            yield page[location.index];
        }
    }
    async mutateRecords(mutation) {
        this.checkDestroyed();
        return this.queue.add(async () => {
            await this.initialized;
            await this.applyMutation(await this.readManifest(), mutation);
            await this.autoCompact();
        });
    }
    async update(updated) {
        this.checkDestroyed();
        return this.queue.add(async () => {
            await this.initialized;
            const current = await this.readManifest();
            await this.writeReplacement(current.generation + 1, updated);
            this.compactionDebt = Infinity;
            await this.autoCompact();
        });
    }
    async compact() {
        this.checkDestroyed();
        return this.queue.add(() => this.compactNow());
    }
    async compactNow() {
        await this.initialized;
        const current = await this.readManifest();
        const replacement = { ...emptyManifest(), generation: current.generation + 1 };
        const shards = new Map();
        let batch = [];
        let sequence = 0;
        for await (const row of this.iterateRecords()) {
            const id = typeof row?._id === 'string' ? row._id : `legacy-${replacement.generation}-${sequence++}`;
            if (!shards.has(this.shardKey(id)))
                shards.set(this.shardKey(id), emptyShard());
            batch.push({ id, row });
            if (batch.length === 512) {
                await this.writePages(batch, replacement, shards);
                batch = [];
            }
        }
        if (batch.length)
            await this.writePages(batch, replacement, shards);
        for (const [key, shard] of shards) {
            const file = `shard-${key}-${replacement.generation}-${this.nonce()}.json`;
            await this.fs.writeJSON(this.shardsPath, file, shard);
            replacement.shards[key] = file;
        }
        await this.fs.writeJSON(this.collectionPath, 'manifest.json', replacement);
        if ((FSPersistence.readers.get(this.collectionPath) ?? 0) > 0)
            return;
        const manifest = await this.readManifest();
        const livePages = new Set();
        for (const shardFile of Object.values(manifest.shards)) {
            const shard = await this.fs.loadJSON(path.join(this.shardsPath, shardFile));
            Object.values(shard.records).forEach((location) => livePages.add(location.page));
        }
        await this.removeUnreferenced(this.pagesPath, livePages);
        await this.removeUnreferenced(this.shardsPath, new Set(Object.values(manifest.shards)));
        this.lastCompactionError = undefined;
        this.compactionDebt = 0;
    }
    async storageStats() {
        this.pinReader(1);
        try {
            return await this.statsSnapshot();
        }
        finally {
            this.pinReader(-1);
        }
    }
    async statsSnapshot() {
        this.checkDestroyed();
        await this.initialized;
        const manifest = await this.readManifest();
        const live = new Set(Object.values(manifest.shards).map((file) => path.join(this.shardsPath, file)));
        const liveSizes = new Map();
        const pageSlots = new Map();
        let tombstones = 0;
        for (const file of Object.values(manifest.shards)) {
            const shard = await this.fs.loadJSON(path.join(this.shardsPath, file));
            tombstones += Object.keys(shard.tombstones).length;
            liveSizes.set(path.join(this.shardsPath, file), new TextEncoder().encode(JSON.stringify({ ...shard, tombstones: {} }, null, 2)).byteLength);
            Object.values(shard.records).forEach((location) => {
                const pagePath = path.join(this.pagesPath, location.page);
                live.add(pagePath);
                const slots = pageSlots.get(pagePath) ?? new Set();
                slots.add(location.index);
                pageSlots.set(pagePath, slots);
            });
        }
        for (const [file, slots] of pageSlots) {
            const rows = await this.fs.loadJSON(file);
            const retained = rows.filter((_, index) => slots.has(index));
            liveSizes.set(file, new TextEncoder().encode(JSON.stringify(retained, null, 2)).byteLength);
        }
        let totalBytes = await this.fs.fileSize(this.manifestPath);
        let liveBytes = totalBytes;
        for (const directory of [this.pagesPath, this.shardsPath]) {
            for (const file of (await this.fs.readDir(directory))) {
                const filePath = path.join(directory, file);
                const size = await this.fs.fileSize(filePath);
                totalBytes += size;
                if (live.has(filePath))
                    liveBytes += Math.min(size, liveSizes.get(filePath) ?? size);
            }
        }
        return {
            generation: manifest.generation,
            liveBytes,
            totalBytes,
            reclaimableBytes: totalBytes - liveBytes,
            tombstones,
            lastCompactionError: this.lastCompactionError,
        };
    }
    async autoCompact() {
        try {
            if (this.compactionDebt < (this.config.compaction?.minReclaimableBytes ?? 16 * 1024 * 1024))
                return;
            const stats = await this.storageStats();
            this.compactionDebt = stats.reclaimableBytes;
            if ((0, compaction_1.shouldCompact)(stats, this.config))
                await this.compactNow();
        }
        catch (error) {
            this.lastCompactionError = error instanceof Error ? error.message : 'Compaction failed';
            this.compactionDebt = Infinity;
        }
    }
    async destroy() {
        this.checkDestroyed();
        await this.initialized;
        return this.queue.add(async () => {
            await this.fs.rmDir(this.system.getOutputPath(), this.collectionName);
            this.destroyed = true;
        });
    }
    async initialize() {
        await this.fs.mkdir(this.collectionPath);
        await this.fs.mkdir(this.pagesPath);
        await this.fs.mkdir(this.shardsPath);
        if (await this.fs.exists(this.manifestPath))
            return;
        const previousPath = path.join(this.collectionPath, 'data');
        if ((await this.fs.exists(previousPath)) && (await this.fs.readData(previousPath)).length > 0) {
            throw new Error(`Collection "${this.collectionName}" requires explicit migration to record storage`);
        }
        await this.fs.writeJSON(this.collectionPath, 'manifest.json', emptyManifest());
    }
    async applyMutation(manifest, mutation) {
        (0, record_pages_1.assertMutationBound)(Math.max(mutation.deletes?.length ?? 0, mutation.puts?.length ?? 0));
        const generation = manifest.generation + 1;
        const next = { ...manifest, generation, shards: { ...manifest.shards } };
        const prepared = (mutation.puts ?? []).map((row, index) => ({
            id: typeof row?._id === 'string' ? row._id : `legacy-${generation}-${index}-${this.nonce()}`,
            row,
        }));
        const affected = new Map();
        for (const id of [...(mutation.deletes ?? []), ...prepared.map((record) => record.id)]) {
            const key = this.shardKey(id);
            if (!affected.has(key))
                affected.set(key, await this.readShard(manifest, key));
        }
        // Conservative retired-byte accounting avoids a whole-store statistics scan
        // on every point mutation. Shared pages may overestimate debt, never hide it.
        const retired = new Set();
        for (const [key] of affected) {
            if (manifest.shards[key])
                retired.add(path.join(this.shardsPath, manifest.shards[key]));
        }
        for (const id of [...(mutation.deletes ?? []), ...prepared.map((record) => record.id)]) {
            const location = affected.get(this.shardKey(id))?.records[id];
            if (location)
                retired.add(path.join(this.pagesPath, location.page));
        }
        for (const file of retired)
            this.compactionDebt += await this.fs.fileSize(file);
        for (const id of mutation.deletes ?? []) {
            const shard = affected.get(this.shardKey(id));
            if (shard.records[id]) {
                delete shard.records[id];
                shard.tombstones[id] = generation;
            }
        }
        await this.writePages(prepared, next, affected);
        await Promise.all(Array.from(affected, async ([key, shard]) => {
            const file = `shard-${key}-${generation}-${this.nonce()}.json`;
            await this.fs.writeJSON(this.shardsPath, file, shard);
            next.shards[key] = file;
        }));
        await this.fs.writeJSON(this.collectionPath, 'manifest.json', next);
    }
    async writeReplacement(generation, rows) {
        (0, record_pages_1.assertMutationBound)(rows.length);
        const manifest = { ...emptyManifest(), generation };
        const prepared = rows.map((row, index) => ({
            id: typeof row?._id === 'string' ? row._id : `legacy-${generation}-${index}-${this.nonce()}`,
            row,
        }));
        const shards = new Map();
        prepared.forEach((record) => {
            if (!shards.has(this.shardKey(record.id)))
                shards.set(this.shardKey(record.id), emptyShard());
        });
        await this.writePages(prepared, manifest, shards);
        await Promise.all(Array.from(shards, async ([key, shard]) => {
            const file = `shard-${key}-${generation}-${this.nonce()}.json`;
            await this.fs.writeJSON(this.shardsPath, file, shard);
            manifest.shards[key] = file;
        }));
        await this.fs.writeJSON(this.collectionPath, 'manifest.json', manifest);
    }
    async writePages(records, manifest, shards) {
        const rows = records.map((record) => record.row);
        const pages = (0, record_pages_1.chunkRecords)(rows);
        let recordOffset = 0;
        const writes = [];
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
            const page = pages[pageIndex];
            const pageName = `page-${manifest.generation}-${pageIndex}-${this.nonce()}.json`;
            writes.push(this.fs.writeJSON(this.pagesPath, pageName, page));
            page.forEach((_, index) => {
                const record = records[recordOffset + index];
                const shard = shards.get(this.shardKey(record.id));
                const previous = shard.records[record.id];
                const sequence = previous?.sequence ?? manifest.nextSequence++;
                shard.records[record.id] = { index, page: pageName, sequence };
                delete shard.tombstones[record.id];
            });
            recordOffset += page.length;
        }
        await Promise.all(writes);
    }
    async readShard(manifest, key) {
        const file = manifest.shards[key];
        return file ? this.fs.loadJSON(path.join(this.shardsPath, file)) : emptyShard();
    }
    readManifest() {
        return this.fs.loadJSON(this.manifestPath);
    }
    readPage(page) {
        return this.fs.loadJSON(path.join(this.pagesPath, page));
    }
    shardKey(id) {
        let hash = 2166136261;
        for (let index = 0; index < id.length; index += 1)
            hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
        return (hash >>> 24).toString(16).padStart(2, '0');
    }
    async removeUnreferenced(directory, live) {
        const files = (await this.fs.readDir(directory));
        await Promise.all(files.filter((file) => !live.has(file)).map((file) => this.fs.rmFile(path.join(directory, file))));
    }
    nonce() {
        return Math.random().toString(36).slice(2, 10);
    }
    pinReader(delta) {
        const count = (FSPersistence.readers.get(this.collectionPath) ?? 0) + delta;
        if (count === 0)
            FSPersistence.readers.delete(this.collectionPath);
        else
            FSPersistence.readers.set(this.collectionPath, count);
    }
    checkDestroyed() {
        if (this.destroyed)
            throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
    }
}
FSPersistence.readers = new Map();
FSPersistence.writers = new Map();
exports.default = FSPersistence;
