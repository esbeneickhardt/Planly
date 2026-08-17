// Named `exportApi` rather than `export` - `export` is a reserved word and can't be used as a
// const binding name, even though it's fine as an object property key (see client.ts's re-export).
export const exportApi = {
  product: (productId: string) => `/api/products/${productId}/export`,
};
