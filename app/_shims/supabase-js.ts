export function createClient(_url, _key, _opts) {
  const ok = (data=null) => ({ data, error: null });
  const q = () => ({
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
      getUser: async () => ok({ user: null }),
      signInWithPassword: async () => ok({ user: null }),
      signOut: async () => ok(null),
    },
    storage: { from: () => ({ upload: async () => ok(), getPublicUrl: () => ({ data: { publicUrl: "" }, error: null }) }) }
  };
}
export default { createClient };
