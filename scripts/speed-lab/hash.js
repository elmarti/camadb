const fs = require('fs');
const path = require('path');
const wabtFactory = require('wabt');

function jsHash(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 24;
}

async function createHasher() {
  const wabt = await wabtFactory();
  const module = wabt.parseWat('hash.wat', fs.readFileSync(path.join(__dirname, 'hash.wat'), 'utf8'));
  const binary = module.toBinary({}).buffer;
  module.destroy();
  const started = performance.now();
  const { instance } = await WebAssembly.instantiate(binary);
  const startupMs = performance.now() - started;
  const { memory, hash, batch } = instance.exports;
  const reserve = (bytes) => {
    if (memory.buffer.byteLength < bytes) memory.grow(Math.ceil((bytes - memory.buffer.byteLength) / 65536));
  };
  function pack(ids) {
    const header = ids.length * 8;
    let bytes = header;
    for (const id of ids) bytes += id.length * 2;
    const output = Math.ceil(bytes / 4) * 4;
    reserve(output + ids.length * 4);
    const words = new Uint32Array(memory.buffer);
    const units = new Uint16Array(memory.buffer);
    let pointer = header;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      words[i * 2] = pointer; words[i * 2 + 1] = id.length;
      for (let j = 0; j < id.length; j++) units[pointer / 2 + j] = id.charCodeAt(j);
      pointer += id.length * 2;
    }
    return { count: ids.length, output };
  }
  function packed(info) {
    batch(0, info.count, info.output);
    return new Uint32Array(memory.buffer, info.output, info.count).slice();
  }
  function jsPacked(info) {
    const words = new Uint32Array(memory.buffer);
    const units = new Uint16Array(memory.buffer);
    const result = new Uint32Array(info.count);
    for (let i = 0; i < info.count; i++) {
      let h = 2166136261;
      const offset = words[i * 2] / 2;
      for (let j = 0; j < words[i * 2 + 1]; j++) h = Math.imul(h ^ units[offset + j], 16777619);
      result[i] = h >>> 24;
    }
    return result;
  }
  function single(id) {
    reserve(id.length * 2);
    const units = new Uint16Array(memory.buffer, 0, id.length);
    for (let i = 0; i < id.length; i++) units[i] = id.charCodeAt(i);
    return hash(0, id.length) >>> 24;
  }
  return { startupMs, binaryBytes: binary.length, memory, pack, packed, jsPacked, single,
    endToEnd: (ids) => packed(pack(ids)) };
}
module.exports = { createHasher, jsHash };
