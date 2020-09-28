export type TEosioAction<T = any> = {
  account: string;
  name: string;
  authorization: { actor: string; permission: string }[];
  data: T;
};

export type TEosioTransaction<T = any> = {
  actions: TEosioAction<T>;
};
