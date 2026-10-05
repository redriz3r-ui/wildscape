import { esc } from "./utils";

export interface Attribute {
  label: string;
  value: string | number;
  /** Only pass markup produced by the app's safe link helper. */
  valueHtml?: string;
}

export function attributes(rows: Attribute[], className = ""): string {
  return `<dl class="attribute-grid ${esc(className)}">${rows
    .map(
      ({ label, value, valueHtml }) =>
        `<div class="attribute-row"><dt>${esc(label)}</dt><dd>${valueHtml ?? esc(value)}</dd></div>`,
    )
    .join("")}</dl>`;
}
