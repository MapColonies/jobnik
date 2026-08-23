export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type IndexerType = string | number | symbol;
