# Vendored third-party code

## StPageFlip (page-flip) 2.0.7

- Used for the customer flipbook. Loaded from `/vendor/page-flip.browser.js` instead of a CDN, so a CDN
  outage or compromise can't affect customer pages.
- Source: npm package `page-flip@2.0.7` (MIT licence, see `page-flip.LICENSE`),
  file `dist/js/page-flip.browser.js`, copied unmodified.
- npm tarball integrity: `sha512-96lQFUUz7r/LZzEUZJ3yBIMEKU9+m8HMFDzTvTdD6P7Ag/wXINjp9n0W7b4wanwnDbQETo4uNUoL3zMqpFxwGA==`
- SHA-256 of the copied file: `bbaca0bbef57a22bb66a3fc69d67baf9a17fb9a9c89ec9ed35e2b91abe4bd1e7`

To update: `npm install --save-exact page-flip@<version>` in a scratch folder, copy
`node_modules/page-flip/dist/js/page-flip.browser.js` and `LICENSE` here, update this note, and test the flipbook.
