type ExcelModule = typeof import('exceljs')

/**
 * Loads exceljs on demand. It is large, so it is only downloaded when someone
 * uploads or exports a workbook.
 */
export async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule }
  return mod.Workbook ? mod : (mod.default as ExcelModule)
}
