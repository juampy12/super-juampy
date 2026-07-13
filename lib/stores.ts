export const STORES = [
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", name: "Super Juampy (Alberdi)", short: "Alberdi" },
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", name: "Super Juampy (Av. San Martín)", short: "Av. San Martín" },
] as const;

export type StoreId = typeof STORES[number]["id"];
