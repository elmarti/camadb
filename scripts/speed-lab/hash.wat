(module
  (memory (export "memory") 1)
  ;; Match the existing filesystem FNV-1a hash over JS UTF-16 code units.
  (func $hash (export "hash") (param $ptr i32) (param $length i32) (result i32)
    (local $i i32) (local $h i32)
    (local.set $h (i32.const -2128831035))
    (block $done (loop $next
      (br_if $done (i32.ge_u (local.get $i) (local.get $length)))
      (local.set $h (i32.mul
        (i32.xor (local.get $h) (i32.load16_u (i32.add (local.get $ptr) (i32.shl (local.get $i) (i32.const 1)))))
        (i32.const 16777619)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $next)))
    (local.get $h))
  (func (export "batch") (param $descriptors i32) (param $count i32) (param $output i32)
    (local $i i32) (local $descriptor i32)
    (block $done (loop $next
      (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
      (local.set $descriptor (i32.add (local.get $descriptors) (i32.shl (local.get $i) (i32.const 3))))
      (i32.store (i32.add (local.get $output) (i32.shl (local.get $i) (i32.const 2)))
        (i32.shr_u (call $hash (i32.load (local.get $descriptor)) (i32.load offset=4 (local.get $descriptor))) (i32.const 24)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $next))))
)
