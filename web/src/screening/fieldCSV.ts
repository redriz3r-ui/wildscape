import { parseField } from "./model";
import type { FieldRecord } from "./types";

/** Strict CSV parsing preserves quoted commas/newlines and rejects ambiguous rows. */
export function parseFieldCSV(text: string): FieldRecord[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, "");
  const pushCell = () => { row.push(cell); cell = ""; closed = false; };
  const pushRow = () => { pushCell(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === ",") pushCell();
    else if (ch === "\r" || ch === "\n") { if (ch === "\r" && input[i + 1] === "\n") i++; pushRow(); }
    else if (ch === '"') { if (cell || closed) throw Error("CSV has an unexpected quote."); quoted = true; }
    else { if (closed) throw Error("CSV has text after a closing quote."); cell += ch; }
  }
  if (quoted) throw Error("CSV has an unclosed quoted field.");
  if (cell || row.length || closed) pushRow();
  const headers = rows.shift()?.map(value => value.trim().toLowerCase());
  if (!headers || new Set(headers).size !== headers.length) throw Error("CSV requires unique column names.");
  for (const header of ["name", "date", "observer", "longitude", "latitude"]) {
    if (!headers.includes(header)) throw Error(`CSV is missing the ${header} column. Use the field CSV template.`);
  }
  if (!rows.length) throw Error("CSV contains no observations.");
  return parseField({type:"FeatureCollection", features: rows.map((row, i) => {
    if (row.length !== headers.length) throw Error(`CSV row ${i + 2}: column count does not match the header.`);
    const p = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    const longitude = p.longitude.trim(), latitude = p.latitude.trim();
    if (!longitude || !latitude || !Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude))) throw Error(`CSV row ${i + 2}: provide decimal WGS84 longitude and latitude.`);
    const sensitive = p.sensitive?.trim().toLowerCase();
    if (sensitive && sensitive !== "true" && sensitive !== "false") throw Error(`CSV row ${i + 2}: sensitive must be true or false.`);
    return {type:"Feature", id: p.id?.trim() || undefined, geometry:{type:"Point", coordinates:[Number(longitude),Number(latitude)]}, properties:{...p, date:p.date.trim(), sensitive:sensitive !== "false"}};
  })});
}
export const fieldCSVTemplate = 'id,name,date,observer,longitude,latitude,kind,method,effort,notes,sensitive\r\n,"REPLACE with identified species",YYYY-MM-DD,REPLACE,-114.6,37.22,Observation,Visual observation,REPLACE with duration or effort,"TEMPLATE ONLY - replace every example value",true\r\n';
