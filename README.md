# findmypallets

Mobile-friendly React app: upload a spreadsheet, scan license plates with a
Zebra keyboard-wedge scanner, and see whether each plate is on the sheet.

## Scripts

- `npm run dev` start the dev server
- `npm test` run unit tests once (`npm run test:watch` to watch)
- `npm run lint` lint with oxlint
- `npm run build` type-check and build for production

## Layout

- `src/components/` UI components
- `src/lib/` pure logic (parsing, matching, export)
- `src/state/` app state
- `src/test/` test setup
