import { readdir, stat, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
async function walk(path) {
  const rows = [];
  for (const file of await readdir(path)) {
    const p = path + "/" + file;
    const s = await stat(p);
    if (s.isDirectory()) rows.push(...(await walk(p)));
    else rows.push([p, s.size, gzipSync(await readFile(p)).length]);
  }
  return rows;
}
const rows = await walk("dist");
console.log("Production size report (raw / gzip):");
for (const [name, size, gzip] of rows.filter((r) => /\.(js|css)$/.test(r[0])))
  console.log(
    `${name}: ${(size / 1024).toFixed(1)} / ${(gzip / 1024).toFixed(1)} KiB`,
  );
const total = rows.reduce((n, r) => n + r[1], 0);
console.log(`Total static output: ${(total / 1024 / 1024).toFixed(2)} MiB`);
for (const row of rows) if (row[1] > 5e6) console.warn("Large asset:", row[0]);
