export const addDays = (d: Date | string | number, n: number) => new Date(new Date(d).getTime() + n*86400000);
export const parseISO = (s: string) => new Date(s);
export const startOfMonth = (d: Date | string | number) => new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
export const endOfMonth   = (d: Date | string | number) => new Date(new Date(d).getFullYear(), new Date(d).getMonth()+1, 0);
export const isValid = (d: unknown) => d instanceof Date && !Number.isNaN(d.valueOf());
export const compareAsc = (a: Date, b: Date) => a.valueOf() - b.valueOf();
export const format = (d: Date | string | number, _fmt?: string, _opts?: unknown) => { try { return new Date(d).toLocaleDateString(); } catch { return String(d); } };
export const locales = { es: {} };
export const es = {};
