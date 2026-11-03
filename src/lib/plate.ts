export type PlateDetection =
  | { status: 'found'; index: number }
  | { status: 'none' }
  | { status: 'multiple'; indexes: number[] }

export interface DuplicateGroup {
  value: string
  /** 0-based row indexes (not counting the heading row). */
  rows: number[]
}

export interface PlateColumnCheck {
  blankRows: number[]
  duplicates: DuplicateGroup[]
}

/** "License_Plate", "licensePlate" and "License Plate #" -> words. */
function words(heading: string): string[] {
  return heading
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function compact(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const EXACT_PLATE = new Set(['licenseplate', 'licenceplate'])
const COMBINED_PLATE = ['licenseplate', 'licenceplate', 'licplate']
const BARE_LICENSE_WORDS = new Set(['license', 'licence', 'lic', 'lp'])

function isPlateHeading(heading: string): boolean {
  const w = words(heading)
  if (w.includes('plate') || w.includes('plates')) return true
  const c = compact(heading)
  return COMBINED_PLATE.some((part) => c.includes(part))
}

function isBareLicenseHeading(heading: string): boolean {
  return words(heading).some((word) => BARE_LICENSE_WORDS.has(word))
}

function indexesWhere(
  headers: string[],
  test: (heading: string) => boolean,
): number[] {
  const out: number[] = []
  headers.forEach((heading, index) => {
    if (test(heading)) out.push(index)
  })
  return out
}

function choose(indexes: number[]): PlateDetection {
  if (indexes.length === 1) return { status: 'found', index: indexes[0] }
  return { status: 'multiple', indexes }
}

/**
 * Guesses which column holds license plates from the headings. The user can
 * always override the guess; this only picks a default.
 */
export function detectPlateColumn(headers: string[]): PlateDetection {
  const plateColumns = indexesWhere(headers, isPlateHeading)
  if (plateColumns.length > 0) {
    if (plateColumns.length > 1) {
      const exact = plateColumns.filter((i) =>
        EXACT_PLATE.has(compact(headers[i])),
      )
      if (exact.length === 1) return { status: 'found', index: exact[0] }
    }
    return choose(plateColumns)
  }

  const licenseColumns = indexesWhere(headers, isBareLicenseHeading)
  if (licenseColumns.length > 0) return choose(licenseColumns)

  return { status: 'none' }
}

/**
 * Finds blank cells and repeated values in the plate column. Values are
 * compared exactly (after trimming), since plates are expected to be written
 * consistently.
 */
export function checkPlateColumn(
  rows: string[][],
  column: number,
): PlateColumnCheck {
  const blankRows: number[] = []
  const seen = new Map<string, number[]>()

  rows.forEach((row, rowIndex) => {
    const value = (row[column] ?? '').trim()
    if (value === '') {
      blankRows.push(rowIndex)
      return
    }
    const list = seen.get(value)
    if (list) list.push(rowIndex)
    else seen.set(value, [rowIndex])
  })

  const duplicates: DuplicateGroup[] = []
  for (const [value, rowIndexes] of seen) {
    if (rowIndexes.length > 1) duplicates.push({ value, rows: rowIndexes })
  }
  return { blankRows, duplicates }
}
