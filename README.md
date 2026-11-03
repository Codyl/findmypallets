# findmypallets

A phone-friendly web app for checking pallets against paperwork. Upload a
spreadsheet, then scan license plates with a Zebra scanner. Each scan is
matched against the spreadsheet's plate column; a match plays a success sound
and shows the whole row, a miss plays an error sound.

Everything runs in the browser. There is no server and no AWS service in this
version, and spreadsheets never leave the device.

## How to use it

1. **Add a spreadsheet.** Tap *Add from Excel or CSV*. `.xlsx` and `.csv` work;
   for an older `.xls`, re-save it as `.xlsx` first. If a workbook has several
   tabs you choose which become sheets. Row 1 must be the column headings.
2. **Check the plate column.** The app picks the column whose heading looks
   like "License Plate" or "Plate". Open *Review* to confirm or change it, fix
   typos by tapping a cell, and see warnings for duplicate or blank plates.
   A sheet with no plate column chosen is skipped when scanning.
3. **Scan.** Tap *Start scanning* (the tap lets the phone play sounds), pick
   *All sheets* or a single sheet under *Search in*, and scan. Plates are
   compared exactly, ignoring only spaces at the start and end.
   - green **Match**: the row is shown and marked found
   - amber **Already scanned**: it was found earlier
   - red **No match**: logged under *Unmatched scans*
4. **Export.** *Export* on a sheet gives CSV or Excel with `Found` and
   `Scanned At` columns. *Export* on the home screen gives one Excel file with
   a tab per sheet plus an `Unmatched Scans` tab. Each can be limited to found
   or not-found rows.
5. **Clean up.** Delete a sheet (with a few seconds to undo), reset a sheet's
   progress, clear the unmatched list, or clear everything.

Sheets and progress are saved in the browser (IndexedDB) so a refresh or locked
phone loses nothing. Clearing browser data erases them, so export first.

## Zebra scanner setup

The app expects the scanner to act as a keyboard ("HID" / keyboard wedge) and
send **Enter** after each scan, which is the default for most Zebra scanners.
Some scanners send Tab instead; that works too. If a scan puts extra characters
before or after the plate, remove the prefix/suffix in the scanner's settings.

## Development

```
npm install
npm run dev        # dev server
npm test           # unit and component tests
npm run lint
npm run build      # type-check and production build into dist/
```

- `src/lib/` pure logic: spreadsheet parsing, plate detection, matching,
  export, sounds, storage
- `src/state/` reducer and provider
- `src/components/` screens and dialogs

Tests are written first for each piece of logic (Vitest + Testing Library).

## Deploying

The build output in `dist/` is a static site, so any static host works.

**AWS Amplify Hosting (config included)**
1. In the Amplify console choose *Host web app*, connect the GitHub repo and
   the `main` branch.
2. Amplify detects `amplify.yml`, which installs, lints, tests and builds, then
   publishes `dist/`. Every push to `main` redeploys.
3. Open the HTTPS URL it gives you on the phone.

**GitHub Pages (workflow included)**
1. In the repo, open *Settings → Pages* and set *Source* to **GitHub Actions**.
2. Push to `main` (or run the *Deploy to GitHub Pages* workflow). It tests,
   builds with the `/findmypallets/` base path, and publishes.
3. Open `https://<your-username>.github.io/findmypallets/`.
Pages from a private repo needs a paid GitHub plan; public repos are free.

**S3 + CloudFront**: run `npm run build`, upload `dist/` to a private S3 bucket,
and serve it through CloudFront with Origin Access Control.

Use HTTPS: it is required for some browser features and keeps the site from
being tampered with. Amplify and CloudFront provide it by default.

## Not built yet

- Photo capture of a paper sheet using AWS Textract
- Fuzzy "did you mean" suggestions for misread plates
- Stripping scanner prefixes/suffixes inside the app
- Paging for very large sheets (thousands of rows render slowly)
- Sign-in
