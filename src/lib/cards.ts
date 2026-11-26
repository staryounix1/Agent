const PALETTES: { base: string; accent: string; lift: string }[] = [
  { base: '#1b1310', accent: '#c2703a', lift: '#f0c48a' },
  { base: '#10161a', accent: '#3a7f8c', lift: '#a8dfe4' },
  { base: '#171226', accent: '#6c4fa1', lift: '#cbb6f0' },
  { base: '#1f150e', accent: '#b8863c', lift: '#f4d9a4' },
  { base: '#101a16', accent: '#3f8a63', lift: '#b6e8c9' },
  { base: '#1c1016', accent: '#a8455f', lift: '#f3bfca' },
];

function jitter(seed: number, mod: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.abs(value - Math.floor(value)) * mod;
}

export function sceneCardSvg(index: number, width: number, height: number): string {
  const palette = PALETTES[index % PALETTES.length];
  const r = width * (0.34 + jitter(index + 3, 0.16));
  const cx = width * (0.24 + jitter(index + 7, 0.5));
  const cy = height * (0.2 + jitter(index + 11, 0.34));
  const tilt = -10 - jitter(index + 13, 12);
  const dots = Array.from({ length: 46 }, (_, i) => {
    const x = jitter(index * 31 + i, width);
    const y = jitter(index * 17 + i * 3, height);
    const size = 2 + Math.round(jitter(index + i, 3));
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${size}" fill="#0b0a09" opacity="0.16"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${palette.base}"/>
<stop offset="0.52" stop-color="${palette.accent}"/>
<stop offset="1" stop-color="${palette.base}"/>
</linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="${palette.lift}" stop-opacity="0.45"/>
<stop offset="1" stop-color="${palette.lift}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
<stop offset="0.4" stop-color="#080706" stop-opacity="0"/>
<stop offset="1" stop-color="#080706" stop-opacity="0.85"/>
</linearGradient>
<linearGradient id="band" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${palette.lift}" stop-opacity="0.5"/>
<stop offset="1" stop-color="${palette.lift}" stop-opacity="0.05"/>
</linearGradient>
</defs>
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="url(#glow)"/>
<g opacity="0.5" fill="none" stroke="${palette.lift}" stroke-width="${Math.max(2, width * 0.004)}">
<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(r * 1.32).toFixed(0)}" stroke-opacity="0.22"/>
<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(r * 1.62).toFixed(0)}" stroke-opacity="0.12"/>
</g>
<g transform="rotate(${tilt.toFixed(1)} ${width / 2} ${height / 2})" opacity="0.55">
<rect x="${-width}" y="${(height * 0.58).toFixed(0)}" width="${width * 3}" height="${(height * 0.16).toFixed(0)}" fill="url(#band)"/>
</g>
${dots}
<rect y="${(height * 0.52).toFixed(0)}" width="${width}" height="${(height * 0.48).toFixed(0)}" fill="url(#fade)"/>
</svg>`;
}

export function sceneCardBlob(index: number, width: number, height: number): Blob {
  return new Blob([sceneCardSvg(index, width, height)], { type: 'image/svg+xml' });
}
