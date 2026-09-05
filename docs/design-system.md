# CamaDB product-family design system

## Decision

CamaDB owns its visual language while borrowing accessible behaviour from
headless primitives where an application framework benefits from them. The
shared foundation is framework-independent CSS custom properties and SVG
assets in `@camadb/design`.

The package remains private until its API has been proven by multiple products.
The open-source website and local knowledge demo are its first consumers.

## Brand idea

**Private by architecture. Fast by evidence.** CamaDB should feel precise,
calm, inspectable, and quietly distinctive. The editorial type, warm neutral
canvas, dark mineral green, and electric data accent communicate a technical
tool without looking like a generic infrastructure dashboard.

The voice is direct and evidence-led. Prefer measured statements, visible
limitations, reproducible numbers, and concrete verbs. Avoid claims such as
"infinitely scalable", "AI-powered", or "zero compromise" that the repository
cannot prove.

## Product family

- **CamaDB open source** is technical, transparent, experimental, and
  benchmark-led.
- **Developer tooling and Studio** are denser and operational while retaining
  the same tokens, controls, and explanatory language.
- **A premium product** may use a distinct name and accent expression, but
  should retain the core mark, typography, geometry, and "by CamaDB"
  relationship. It is not part of the open-source website.

## Process

1. Start every surface with the semantic `--cama-*` tokens and shared assets.
2. Compose product-specific layouts locally; do not add speculative components.
3. Promote a pattern to `@camadb/design` when a second real surface needs it.
4. Test keyboard focus, reduced motion, mobile layout, and colour contrast.
5. Record visual changes in screenshots once a component catalogue exists.
6. Treat copy, benchmark methodology, limitations, and privacy language as
   part of the design system—not afterthoughts.

## Current primitives

The first release includes colour, typography, spacing, geometry, motion,
focus, shell, brand, button, field, card, badge, and code-block primitives.
Dark-mode product tokens and framework wrappers are intentionally deferred
until a product needs them.
