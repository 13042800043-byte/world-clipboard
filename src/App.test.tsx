import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./lib/demoScene', async () => {
  const actual = await vi.importActual<typeof import('./lib/demoScene')>('./lib/demoScene');
  return {
    ...actual,
    drawDemoScene: vi.fn(),
    renderDemoObject: vi.fn(() => ({
      imageData: {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          235, 75, 60, 255,
          235, 75, 60, 255,
          235, 75, 60, 255,
          0, 0, 0, 0,
        ]),
      },
      previewUrl: 'data:image/png;base64,demo',
    })),
  };
});

describe('World Clipboard mini program flow', () => {
  it('captures an object and generates a Perler template on the creation page', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '捕捉现实' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '物体' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '抓取小猫摆件' }));
    expect(screen.getByRole('heading', { name: '转换创作' })).toBeInTheDocument();
    expect(screen.getByText('小猫摆件')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成拼豆模板' }));
    expect(screen.getByRole('heading', { name: '拼豆图纸' })).toBeInTheDocument();
    expect(screen.getByText(/总计/)).toBeInTheDocument();
  });

  it('lets the user choose object, color, or contour capture intent', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '颜色' }));
    expect(screen.getByRole('button', { name: '颜色' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '轮廓' }));
    expect(screen.getByRole('button', { name: '轮廓' })).toHaveAttribute('aria-pressed', 'true');
  });
});
