import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../extension/icons');
mkdirSync(iconsDir, { recursive: true });

function draw(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.1; // corner radius
  const pad = size * 0.06;

  // Background — Claude orange
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(size - pad - r, pad);
  ctx.quadraticCurveTo(size - pad, pad, size - pad, pad + r);
  ctx.lineTo(size - pad, size - pad - r);
  ctx.quadraticCurveTo(size - pad, size - pad, size - pad - r, size - pad);
  ctx.lineTo(pad + r, size - pad);
  ctx.quadraticCurveTo(pad, size - pad, pad, size - pad - r);
  ctx.lineTo(pad, pad + r);
  ctx.quadraticCurveTo(pad, pad, pad + r, pad);
  ctx.closePath();
  ctx.fillStyle = '#d97706';
  ctx.fill();

  const cx = size / 2;
  const cy = size / 2;
  const lw = Math.max(1.5, size * 0.055);

  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Annotation bracket — left vertical
  const bx = cx - size * 0.22;
  const by = cy - size * 0.2;
  const bh = size * 0.4;
  const bw = size * 0.1;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(bx + bw, by);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx, by + bh);
  ctx.lineTo(bx + bw, by + bh);
  ctx.stroke();

  // Three annotation lines (text lines)
  const lx = cx - size * 0.06;
  const lineGap = size * 0.13;
  const lineLen = [size * 0.28, size * 0.22, size * 0.16];
  ctx.lineWidth = lw * 0.85;
  [0, 1, 2].forEach(i => {
    ctx.beginPath();
    ctx.moveTo(lx, cy - lineGap + i * lineGap);
    ctx.lineTo(lx + lineLen[i], cy - lineGap + i * lineGap);
    ctx.stroke();
  });

  // Send arrow — bottom right
  const ax = cx + size * 0.18;
  const ay = cy + size * 0.18;
  const as = size * 0.16;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(ax - as, ay);
  ctx.lineTo(ax + as * 0.3, ay);
  ctx.moveTo(ax + as * 0.3 - as * 0.45, ay - as * 0.45);
  ctx.lineTo(ax + as * 0.3, ay);
  ctx.lineTo(ax + as * 0.3 - as * 0.45, ay + as * 0.45);
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

for (const size of [16, 48, 128]) {
  const buf = draw(size);
  writeFileSync(join(iconsDir, `icon${size}.png`), buf);
  console.log(`icon${size}.png generated`);
}
