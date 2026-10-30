# Self-hosted fonts (admin side)

The admin uses Montserrat (headings, numbers) and Inter (body text), served from here instead of Google Fonts.
Latin subset only, `font-display: swap`, loaded with `@font-face` in `index.html`.

- `montserrat-latin-600-normal.woff2`, `montserrat-latin-700-normal.woff2`: npm package `@fontsource/montserrat@5.3.0`
- `inter-latin-400-normal.woff2`, `inter-latin-500-normal.woff2`, `inter-latin-600-normal.woff2`: npm package `@fontsource/inter@5.3.0`
- Licences: SIL Open Font License 1.1 (`Montserrat-OFL.txt`, `Inter-OFL.txt`).

SHA-256 of the copied files:

```
d857325c360f7128b347ca924c1974967aaa886ba47dad22e4042d6c38b26a83  montserrat-latin-600-normal.woff2
f9d9e65b15372cebcafc3acd1e664a564c5c4b23278de4d5760de9a13c530371  montserrat-latin-700-normal.woff2
8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc  inter-latin-400-normal.woff2
f3779f1efccc4bdcdf9c0a02ab95bf6bd092ed09c48c08cedc725889edd1d19f  inter-latin-500-normal.woff2
f9a06e79cd3a2a20951c0f0e28f66dd0e6d3fda73911d640a2125c8fcb78f21a  inter-latin-600-normal.woff2
```

To update: in a scratch folder run `npm install --save-exact @fontsource/montserrat @fontsource/inter`, copy the
`files/*-latin-<weight>-normal.woff2` files and the `LICENSE` files here, and update this note.

The customer booklet keeps its own fonts (Fraunces, Work Sans, IBM Plex Mono, Poppins from Google Fonts). Do not change those.
