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

describe('World Clipboard demo flow', () => {
  it('copies a demo object and pastes it into the Perler target', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: '粘贴为拼豆' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '抓取红色马克杯' }));
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(screen.getByText('红色马克杯')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '粘贴为拼豆' }));
    expect(screen.getByRole('heading', { name: '拼豆模板' })).toBeInTheDocument();
    expect(screen.getByText(/总计/)).toBeInTheDocument();
  });
});

