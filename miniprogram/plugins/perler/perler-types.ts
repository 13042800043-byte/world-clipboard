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
};
