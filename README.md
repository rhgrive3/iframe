# iframe autoclicker

`a.js` is the Safari-ready distribution script.

The controller supports click actions, URL navigation, condition waits, touch recording, presets, timing jitter, and positional jitter.

## Tests

```
node --test tests/*.test.mjs test/*.test.mjs
```

`tests/granblue-browser-longrun.test.mjs` drives the panel against a Granblue
battle simulator (`tests/fixtures/granblue-sim/`) in a real Chromium through
Playwright: it checks that the full-auto wait ends on the attack rather than on
an ability, and that a long session keeps documents, nodes, listeners and heap
flat while the periodic memory relief keeps running. It skips itself when
Playwright is not installed.
