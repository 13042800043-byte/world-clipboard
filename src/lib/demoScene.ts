import type { NormalizedPoint } from './pinch';

export type DemoObject = {
  id: 'mug' | 'plant';
  label: string;
};

const MUG: DemoObject = { id: 'mug', label: '红色马克杯' };
const PLANT: DemoObject = { id: 'plant', label: '桌面绿植' };

export function findDemoObjectAt(point: NormalizedPoint): DemoObject | undefined {
  const inMugBody = point.x >= 0.18 && point.x <= 0.36 && point.y >= 0.45 && point.y <= 0.76;
  const inMugHandle = point.x >= 0.34 && point.x <= 0.45 && point.y >= 0.5 && point.y <= 0.68;
  if (inMugBody || inMugHandle) return MUG;

  const plantDx = (point.x - 0.69) / 0.17;
  const plantDy = (point.y - 0.4) / 0.28;
  const inLeaves = plantDx ** 2 + plantDy ** 2 <= 1;
  const inPot = point.x >= 0.62 && point.x <= 0.76 && point.y >= 0.57 && point.y <= 0.76;
  if (inLeaves || inPot) return PLANT;

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

  context.fillStyle = 'rgba(244,247,245,.64)';
  context.font = `${Math.max(13, width * 0.014)}px ui-sans-serif, system-ui`;
  context.fillText('点击物体，或开启摄像头后用 Pinch 抓取', width * 0.045, height * 0.08);
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
  else drawCutoutPlant(context, size);

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

