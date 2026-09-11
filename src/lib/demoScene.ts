import type { NormalizedPoint } from './pinch';

export type DemoObject = {
  id: 'mug' | 'plant' | 'cat';
  label: string;
};

const MUG: DemoObject = { id: 'mug', label: '红色马克杯' };
const PLANT: DemoObject = { id: 'plant', label: '桌面绿植' };
const CAT: DemoObject = { id: 'cat', label: '小猫摆件' };

export const DEMO_OBJECTS = [CAT, MUG, PLANT] as const;

export function findDemoObjectAt(point: NormalizedPoint): DemoObject | undefined {
  const inMugBody = point.x >= 0.18 && point.x <= 0.36 && point.y >= 0.45 && point.y <= 0.76;
  const inMugHandle = point.x >= 0.34 && point.x <= 0.45 && point.y >= 0.5 && point.y <= 0.68;
  if (inMugBody || inMugHandle) return MUG;

  const plantDx = (point.x - 0.69) / 0.17;
  const plantDy = (point.y - 0.4) / 0.28;
  const inLeaves = plantDx ** 2 + plantDy ** 2 <= 1;
  const inPot = point.x >= 0.62 && point.x <= 0.76 && point.y >= 0.57 && point.y <= 0.76;
  if (inLeaves || inPot) return PLANT;

  const catDx = (point.x - 0.5) / 0.16;
  const catDy = (point.y - 0.65) / 0.16;
  if (catDx ** 2 + catDy ** 2 <= 1) return CAT;

  return undefined;
}

export function drawDemoScene(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a2621');
  gradient.addColorStop(0.55, '#111916');
  gradient.addColorStop(1, '#26352e');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgba(255,255,255,.025)';
  for (let x = 0; x < width; x += 48) context.fillRect(x, 0, 1, height * 0.72);
  for (let y = 0; y < height * 0.72; y += 48) context.fillRect(0, y, width, 1);

  context.fillStyle = '#c6a67d';
  context.fillRect(0, height * 0.72, width, height * 0.28);
  context.fillStyle = 'rgba(87,53,31,.12)';
  for (let y = height * 0.76; y < height; y += 34) context.fillRect(0, y, width, 2);

  drawSceneMug(context, width, height);
  drawScenePlant(context, width, height);
  drawSceneCat(context, width, height);

  context.fillStyle = 'rgba(244,247,245,.64)';
  context.font = `${Math.max(13, width * 0.014)}px ui-sans-serif, system-ui`;
  context.fillText('点击物体，模拟 Pinch 抓取', width * 0.045, height * 0.08);
}

export function renderDemoObject(
  object: DemoObject,
  size = 320,
): { imageData: ImageData; previewUrl: string } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable.');

  if (object.id === 'mug') drawCutoutMug(context, size);
  else if (object.id === 'plant') drawCutoutPlant(context, size);
  else drawCutoutCat(context, size);

  return {
    imageData: context.getImageData(0, 0, size, size),
    previewUrl: canvas.toDataURL('image/png'),
  };
}

function drawSceneMug(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.translate(width * 0.12, height * 0.34);
  context.scale(width * 0.38, height * 0.5);
  drawMug(context);
  context.restore();
}

function drawScenePlant(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.translate(width * 0.53, height * 0.08);
  context.scale(width * 0.32, height * 0.68);
  drawPlant(context);
  context.restore();
}

function drawSceneCat(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.translate(width * 0.29, height * 0.49);
  context.scale(width * 0.42, width * 0.42);
  drawCat(context);
  context.restore();
}

function drawCutoutMug(context: CanvasRenderingContext2D, size: number): void {
  context.save();
  context.translate(size * 0.08, size * 0.08);
  context.scale(size * 0.84, size * 0.84);
  drawMug(context);
  context.restore();
}

function drawCutoutPlant(context: CanvasRenderingContext2D, size: number): void {
  context.save();
  context.translate(size * 0.08, size * 0.03);
  context.scale(size * 0.84, size * 0.92);
  drawPlant(context);
  context.restore();
}

function drawCutoutCat(context: CanvasRenderingContext2D, size: number): void {
  context.save();
  context.translate(size * 0.06, size * 0.03);
  context.scale(size * 0.88, size * 0.9);
  drawCat(context);
  context.restore();
}

function drawCat(context: CanvasRenderingContext2D): void {
  context.fillStyle = 'rgba(31, 35, 36, .18)';
  context.beginPath();
  context.ellipse(0.5, 0.91, 0.31, 0.055, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#f6f2eb';
  context.beginPath();
  context.ellipse(0.5, 0.68, 0.25, 0.28, 0, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.arc(0.5, 0.36, 0.27, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#62676b';
  context.beginPath();
  context.moveTo(0.28, 0.25);
  context.lineTo(0.31, 0.03);
  context.lineTo(0.45, 0.17);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(0.55, 0.17);
  context.lineTo(0.7, 0.03);
  context.lineTo(0.73, 0.27);
  context.closePath();
  context.fill();

  context.fillStyle = '#e9a5a0';
  context.beginPath();
  context.moveTo(0.315, 0.19);
  context.lineTo(0.33, 0.09);
  context.lineTo(0.4, 0.18);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(0.6, 0.18);
  context.lineTo(0.68, 0.09);
  context.lineTo(0.69, 0.2);
  context.closePath();
  context.fill();

  context.fillStyle = '#656a6e';
  context.beginPath();
  context.arc(0.39, 0.31, 0.13, Math.PI * .85, Math.PI * 1.9);
  context.lineTo(0.5, 0.35);
  context.closePath();
  context.fill();
  context.beginPath();
  context.arc(0.62, 0.32, 0.12, Math.PI * 1.15, Math.PI * 2.15);
  context.lineTo(0.53, 0.36);
  context.closePath();
  context.fill();

  context.fillStyle = '#232829';
  context.beginPath();
  context.arc(0.41, 0.36, 0.026, 0, Math.PI * 2);
  context.arc(0.59, 0.36, 0.026, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#df8f8a';
  context.beginPath();
  context.moveTo(0.5, 0.4);
  context.lineTo(0.47, 0.43);
  context.lineTo(0.53, 0.43);
  context.closePath();
  context.fill();

  context.strokeStyle = '#9a4541';
  context.lineWidth = 0.025;
  context.beginPath();
  context.arc(0.5, 0.57, 0.2, 0.15, Math.PI - 0.15);
  context.stroke();
  context.fillStyle = '#e0ac42';
  context.beginPath();
  context.arc(0.5, 0.62, 0.055, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#f6f2eb';
  context.beginPath();
  context.ellipse(0.37, 0.83, 0.095, 0.13, 0, 0, Math.PI * 2);
  context.ellipse(0.63, 0.83, 0.095, 0.13, 0, 0, Math.PI * 2);
  context.fill();
}

function drawMug(context: CanvasRenderingContext2D): void {
  context.fillStyle = 'rgba(0,0,0,.2)';
  context.beginPath();
  context.ellipse(0.5, 0.9, 0.32, 0.07, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#f36a55';
  context.lineWidth = 0.1;
  context.beginPath();
  context.ellipse(0.72, 0.56, 0.22, 0.2, 0, -Math.PI / 2, Math.PI / 2);
  context.stroke();

  const body = context.createLinearGradient(0.15, 0.25, 0.67, 0.82);
  body.addColorStop(0, '#ff7560');
  body.addColorStop(1, '#c9322c');
  context.fillStyle = body;
  context.beginPath();
  context.roundRect(0.18, 0.22, 0.52, 0.64, 0.1);
  context.fill();

  context.fillStyle = '#67241f';
  context.beginPath();
  context.ellipse(0.44, 0.24, 0.25, 0.065, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,.2)';
  context.roundRect(0.25, 0.32, 0.055, 0.36, 0.03);
  context.fill();
}

function drawPlant(context: CanvasRenderingContext2D): void {
  context.strokeStyle = '#6ea47b';
  context.lineWidth = 0.025;
  context.beginPath();
  context.moveTo(0.5, 0.67);
  context.lineTo(0.5, 0.23);
  context.moveTo(0.5, 0.44);
  context.lineTo(0.28, 0.31);
  context.moveTo(0.5, 0.49);
  context.lineTo(0.73, 0.34);
  context.stroke();

  const leaves = [
    [0.5, 0.19, -0.2], [0.32, 0.28, -0.75], [0.68, 0.3, 0.75],
    [0.25, 0.43, -1], [0.75, 0.44, 1], [0.39, 0.49, -0.5], [0.62, 0.5, 0.45],
  ];
  leaves.forEach(([x, y, rotation], index) => {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.fillStyle = index % 2 === 0 ? '#79b779' : '#3e8258';
    context.beginPath();
    context.ellipse(0, 0, 0.11, 0.055, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });

  const pot = context.createLinearGradient(0.3, 0.58, 0.7, 0.93);
  pot.addColorStop(0, '#e6a45f');
  pot.addColorStop(1, '#a85b3e');
  context.fillStyle = pot;
  context.beginPath();
  context.moveTo(0.28, 0.61);
  context.lineTo(0.72, 0.61);
  context.lineTo(0.64, 0.92);
  context.quadraticCurveTo(0.5, 0.98, 0.36, 0.92);
  context.closePath();
  context.fill();
  context.fillStyle = '#8d4b37';
  context.roundRect(0.25, 0.58, 0.5, 0.1, 0.04);
  context.fill();
}
