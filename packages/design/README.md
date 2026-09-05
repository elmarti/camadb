# CamaDB design

The shared, framework-independent visual foundation for CamaDB's open-source
website, interactive examples, developer tooling, and related products.

The package is private while the system is young. Its source of truth is
portable CSS custom properties and SVG assets, so it can later be published or
consumed by applications outside this workspace without adopting a particular
JavaScript framework.

## Use

Import the complete foundation:

```css
@import '../../../packages/design/src/index.css';
```

Applications should use the semantic `--cama-*` tokens. Product-specific
styles may compose them, but must not redefine the shared palette or type
scale. New reusable patterns belong here only after a second real consumer
needs them.

See [the design-system decision](../../docs/design-system.md) for brand and
governance guidance.
