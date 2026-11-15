// Loads the seasonal dust grids. Row 0 of every volume is north.

export async function fetchDustCatalog(base) {
  const response = await fetch(`${base}catalog.json`);
  if (!response.ok) throw new Error(`catalog.json: HTTP ${response.status}`);
  return response.json();
}

export async function fetchGzipBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(buffer);
}

export function productSpec(catalog, product) {
  if (product === 'my34') return { file: catalog.my34.file, grid: catalog.cdod.grid, mode: 'cdod', stops: catalog.cdod.colorStops };
  if (product === 'frequency') return { file: catalog.frequency.file.file, grid: catalog.frequency.grid, mode: 'frequency', stops: catalog.frequency.colorStops };
  return { file: catalog.cdod.file.file, grid: catalog.cdod.grid, mode: 'cdod', stops: catalog.cdod.colorStops };
}
