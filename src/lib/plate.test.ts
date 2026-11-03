import { checkPlateColumn, detectPlateColumn } from './plate'

describe('detectPlateColumn', () => {
  it('finds a single obvious plate heading', () => {
    expect(detectPlateColumn(['Pallet', 'License Plate', 'Qty'])).toEqual({
      status: 'found',
      index: 1,
    })
  })

  it.each([
    'License Plate',
    'license plate',
    'LICENSE_PLATE',
    'Plate',
    'Plate #',
    'Plate No.',
    'Lic Plate',
    'Licence Plate',
    'Vehicle Plate Number',
  ])('recognizes "%s"', (heading) => {
    expect(detectPlateColumn(['Other', heading])).toEqual({
      status: 'found',
      index: 1,
    })
  })

  it('returns none when nothing looks like a plate', () => {
    expect(detectPlateColumn(['Pallet', 'Lot', 'Qty'])).toEqual({
      status: 'none',
    })
    expect(detectPlateColumn([])).toEqual({ status: 'none' })
  })

  it('prefers an exact "license plate" heading when several contain plate', () => {
    expect(detectPlateColumn(['Plate Color', 'License Plate'])).toEqual({
      status: 'found',
      index: 1,
    })
  })

  it('reports multiple when it cannot choose between plate headings', () => {
    expect(detectPlateColumn(['Plate Color', 'Plate State'])).toEqual({
      status: 'multiple',
      indexes: [0, 1],
    })
  })

  it('falls back to a bare license heading when no heading has "plate"', () => {
    expect(detectPlateColumn(['Pallet', 'License #'])).toEqual({
      status: 'found',
      index: 1,
    })
    expect(detectPlateColumn(['Pallet', 'Lic'])).toEqual({
      status: 'found',
      index: 1,
    })
  })

  it('does not use the weak license fallback when a plate heading exists', () => {
    expect(detectPlateColumn(['License #', 'Plate'])).toEqual({
      status: 'found',
      index: 1,
    })
  })

  it('does not treat unrelated words that merely contain "plate" letters oddly', () => {
    expect(detectPlateColumn(['Template', 'Qty'])).toEqual({ status: 'none' })
  })
})

describe('checkPlateColumn', () => {
  const rows = [
    ['ABC123', 'a'],
    ['XYZ789', 'b'],
    ['ABC123', 'c'],
    ['', 'd'],
    ['  ', 'e'],
    ['XYZ789', 'f'],
    ['LMN456', 'g'],
  ]

  it('lists blank rows (0-based row indexes)', () => {
    expect(checkPlateColumn(rows, 0).blankRows).toEqual([3, 4])
  })

  it('groups duplicate values with their row indexes', () => {
    expect(checkPlateColumn(rows, 0).duplicates).toEqual([
      { value: 'ABC123', rows: [0, 2] },
      { value: 'XYZ789', rows: [1, 5] },
    ])
  })

  it('compares exactly, so different case is not a duplicate', () => {
    const result = checkPlateColumn([['abc123'], ['ABC123']], 0)
    expect(result.duplicates).toEqual([])
  })

  it('does not count blanks as duplicates of each other', () => {
    const result = checkPlateColumn([[''], ['']], 0)
    expect(result.duplicates).toEqual([])
    expect(result.blankRows).toEqual([0, 1])
  })

  it('is clean for unique plates', () => {
    expect(checkPlateColumn([['A'], ['B']], 0)).toEqual({
      blankRows: [],
      duplicates: [],
    })
  })

  it('treats a missing cell as blank', () => {
    expect(checkPlateColumn([['A'], []], 0).blankRows).toEqual([1])
  })
})
