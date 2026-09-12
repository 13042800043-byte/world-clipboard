export type PerlerCell = {
  key: string;
  color: string;
  empty: boolean;
};

export type PerlerColorCount = {
  id: string;
  name: string;
  hex: string;
  count: number;
};

export type PerlerResult = {
  size: number;
  cells: PerlerCell[];
  colors: PerlerColorCount[];
  totalBeads: number;
  paletteId?: 'legacy' | 'mard221' | 'mard291';
  paletteSize?: number;
  style?: 'cartoon' | 'realistic';
  maxColors?: number;
  beadPreview?: string;
  chartPreview?: string;
};

export type PerlerOptions = {
  palette?: 'legacy' | 'mard221' | 'mard291';
  style?: 'cartoon' | 'realistic';
  maxColors?: number;
  includePreviews?: boolean;
};
