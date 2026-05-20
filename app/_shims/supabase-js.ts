export function createClient(_url: string, _key: string, _opts?: unknown) {
  const ok = (data: unknown = null) => ({ data, error: null });
  const q = (): unknown => ({
    select: async () => ok([]),
    insert: async () => ok([]),
    update: async () => ok([]),
    delete: async () => ok([]),
    eq: () => q(), in: () => q(), order: () => q(), limit: () => q(), range: () => q(),
  });
  return {
    from: () => q(),
    rpc: async () => ok(null),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ data: null, error: null }),
    },
    storage: { from: () => ({ upload: async () => ok(), getPublicUrl: () => ({ data: { publicUrl: "" }, error: null }) }) }
  };
}
export default { createClient };
