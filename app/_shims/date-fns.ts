export const addDays = (d, n) => new Date(new Date(d).getTime() + n*86400000);
export const parseISO = (s) => new Date(s);
export const startOfMonth = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
export const endOfMonth   = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth()+1, 0);
export const isValid = (d) => d instanceof Date && !Number.isNaN(d.valueOf());
export const compareAsc = (a,b) => a - b;
export const format = (d, _fmt, _opts) => { try { return new Date(d).toLocaleDateString(); } catch { return String(d); } };
export const locales = { es: {} };
export const es = {};
