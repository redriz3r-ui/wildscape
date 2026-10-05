export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const safeUrl = (s: string) => {
  try {
    const u = new URL(s);
    return ["https:", "http:"].includes(u.protocol) ? esc(u.href) : "";
  } catch {
    return "";
  }
};
export const link = (url: string, label: string) =>
  safeUrl(url)
    ? `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`
    : esc(label);
export const fmt = (n: number, d = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: d });
export function download(
  name: string,
  content: string | Blob,
  type = "application/json",
) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const csv = (rows: unknown[][]) =>
  rows
    .map((row) =>
      row
        .map((x) => {
          let v = String(x ?? "");
          if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
          return '"' + v.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
export async function readJSON(file: File) {
  if (file.size > 10_000_000)
    throw Error("File exceeds the 10 MB prototype import limit.");
  return JSON.parse(await file.text());
}
