# Storage benchmark baseline

The baseline is preserved below. See the [Wave 4 comparison and workload guidance](./wave4-comparison.md) for the post-#83/#53 measurements, cache workloads, regressions, and remaining exit-gate limitations.

See the [speed experiment decision record](./speed-lab/README.md) for measured WASM hashing, Map-backed storage, and JavaScript lookup experiments, including rejected approaches, raw samples, reproduction scripts, and evidence-retention rules. These experiments do not change production storage.

This is the pre-#83/#53 baseline for the whole-collection storage architecture. The raw samples and machine metadata are in [`baseline-node24-apple-m5.json`](./baseline-node24-apple-m5.json).

## Environment and method

- Node.js 24.20.0, Apple M5 arm64, macOS, 24 GiB memory
- Five iterations per adapter, collection size, and operation
- Median elapsed time, process heap delta, and filesystem collection bytes reported
- Identical deterministic documents and operation order for every size
- Point reads use the already-seeded collection; they measure the current linear query path, not cold process startup

Run the same workload with:

```sh
yarn benchmark:storage --sizes 100,1000,10000 --iterations 5 --output benchmark.json
```

## Median filesystem results

| Records | Operation    | Time (ms) | Heap delta | Collection size |
| ------: | ------------ | --------: | ---------: | --------------: |
|     100 | bulk insert  |    25.476 |    242 KiB |         6.7 KiB |
|     100 | point read   |     0.325 |     24 KiB |         6.7 KiB |
|     100 | point update |     8.020 |    149 KiB |         6.6 KiB |
|     100 | point delete |     8.156 |    156 KiB |         6.6 KiB |
|   1,000 | bulk insert  |    27.287 |   1.28 MiB |        70.1 KiB |
|   1,000 | point read   |     0.792 |     22 KiB |        70.1 KiB |
|   1,000 | point update |    10.899 |   1014 KiB |        70.1 KiB |
|   1,000 | point delete |     9.937 |   1.02 MiB |        70.1 KiB |
|  10,000 | bulk insert  |    33.849 |  11.67 MiB |       748.9 KiB |
|  10,000 | point read   |     1.319 |     52 KiB |       748.8 KiB |
|  10,000 | point update |    17.355 |   9.27 MiB |       748.8 KiB |
|  10,000 | point delete |    17.456 |   9.53 MiB |       748.8 KiB |

## Baseline interpretation

Filesystem point updates and deletes grow with collection size even though one record changes. At 10,000 records each allocates roughly 9–10 MiB while rewriting a collection smaller than 1 MiB. In-memory point reads, updates, and deletes also scale linearly because queries scan the collection. These results establish the behavior #83 must remove: normal point operations hydrate, transform, or serialize work proportional to the complete collection.

Heap deltas are process observations and can be noisy; compare medians and scaling rather than treating them as retained-memory measurements. Absolute timing varies by machine. Post-#83 and post-#53 comparisons must use this committed harness, the same sizes and iteration count, and disclose runtime/hardware differences.
