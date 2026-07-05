export type ExportCell = string | number | boolean | Date | null | undefined;

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => ExportCell;
};

const textEncoder = new TextEncoder();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeCell(value: ExportCell): string | number | boolean {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return value;
}

function csvEscape(value: ExportCell): string {
  const normalized = normalizeCell(value);
  const text = String(normalized);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string): void {
  const lines = [
    columns.map((column) => csvEscape(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(column.value(row))).join(",")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, filename);
}

function columnName(index: number): string {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function buildCellXml(cellReference: string, value: ExportCell): string {
  const normalized = normalizeCell(value);

  if (typeof normalized === "number" && Number.isFinite(normalized)) {
    return `<c r="${cellReference}"><v>${normalized}</v></c>`;
  }

  if (typeof normalized === "boolean") {
    return `<c r="${cellReference}" t="b"><v>${normalized ? 1 : 0}</v></c>`;
  }

  return `<c r="${cellReference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    String(normalized),
  )}</t></is></c>`;
}

function worksheetXml<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const headerRow = `<row r="1">${columns
    .map((column, index) => buildCellXml(`${columnName(index)}1`, column.header))
    .join("")}</row>`;

  const dataRows = rows
    .map((row, rowIndex) => {
      const excelRowNumber = rowIndex + 2;
      const cells = columns
        .map((column, columnIndex) =>
          buildCellXml(`${columnName(columnIndex)}${excelRowNumber}`, column.value(row)),
        )
        .join("");
      return `<row r="${excelRowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${headerRow}${dataRows}</sheetData></worksheet>`;
}

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(
    sheetName,
  )}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = {
  name: string;
  bytes: Uint8Array;
  crc: number;
  offset: number;
};

function writeUint16(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function dosDateTime(): { date: number; time: number } {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const date = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  return { date, time };
}

function createZip(files: Record<string, string>): Uint8Array {
  const { date, time } = dosDateTime();
  const entries: ZipEntry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = textEncoder.encode(name);
    const bytes = textEncoder.encode(content);
    const crc = crc32(bytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, time);
    writeUint16(localHeader, 12, date);
    writeUint32(localHeader, 14, crc);
    writeUint32(localHeader, 18, bytes.length);
    writeUint32(localHeader, 22, bytes.length);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, bytes);
    entries.push({ name, bytes, crc, offset });
    offset += localHeader.length + bytes.length;
  });

  const centralDirectoryOffset = offset;

  entries.forEach((entry) => {
    const nameBytes = textEncoder.encode(entry.name);
    const centralHeader = new Uint8Array(46 + nameBytes.length);

    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, time);
    writeUint16(centralHeader, 14, date);
    writeUint32(centralHeader, 16, entry.crc);
    writeUint32(centralHeader, 20, entry.bytes.length);
    writeUint32(centralHeader, 24, entry.bytes.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, entry.offset);
    centralHeader.set(nameBytes, 46);

    chunks.push(centralHeader);
    offset += centralHeader.length;
  });

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endRecord = new Uint8Array(22);
  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, entries.length);
  writeUint16(endRecord, 10, entries.length);
  writeUint32(endRecord, 12, centralDirectorySize);
  writeUint32(endRecord, 16, centralDirectoryOffset);
  writeUint16(endRecord, 20, 0);
  chunks.push(endRecord);
  offset += endRecord.length;

  const result = new Uint8Array(offset);
  let cursor = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, cursor);
    cursor += chunk.length;
  });
  return result;
}

export function downloadXlsx<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = "Sheet1",
): void {
  const workbookFiles = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": rootRelationshipsXml(),
    "xl/workbook.xml": workbookXml(sheetName),
    "xl/_rels/workbook.xml.rels": workbookRelationshipsXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(rows, columns),
  };
  const zipBytes = createZip(workbookFiles);
  const blob = new Blob([zipBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
}
