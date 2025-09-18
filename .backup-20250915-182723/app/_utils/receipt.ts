import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

async function toDataURL(path: string): Promise<string> {
  const res = await fetch(path);
  const blob = await res.blob();
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function exportReceiptPDF(opts: {
  saleId?: string;
  storeName: string;
  items: { name: string; qty: number; price: number; subtotal: number }[];
  payMethod: "efectivo" | "tarjeta" | "transferencia";
  amount: number;
  change: number;
  total: number;
}) {
  const W = 80;
  const margin = 5;
  const headerH = 26;
  const rowsH = Math.max(1, opts.items.length) * 6 + 8;
  const totalsH = 24;
  const footerH = 16;
  const H = Math.max(100, headerH + rowsH + totalsH + footerH);

  const doc = new jsPDF({ unit: "mm", format: [W, H] });
  const money = (n: number) => "$" + Number(n || 0).toFixed(2);
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  let y = margin;
  let hasLogo = false;
  try {
    const logo = await toDataURL("/logo-super-juampy.png");
    doc.addImage(logo, "PNG", (W - 30) / 2, y, 30, 14);
    hasLogo = true;
  } catch {}
  y += hasLogo ? 16 : 0;

  doc.setFontSize(10);
  doc.text(opts.storeName || "Sucursal", W / 2, y, { align: "center" });
  y += 5;
  const now = new Date();
  doc.setFontSize(8);
  doc.text(now.toLocaleString(), W / 2, y, { align: "center" });
  y += 4;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 0.5, halign: "left" },
    margin: { left: margin, right: margin },
    head: [["Producto", "Cant", "Precio", "Subt."]],
    headStyles: { fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 10, halign: "right" }, 2: { cellWidth: 14, halign: "right" }, 3: { cellWidth: 14, halign: "right" } },
    body: opts.items.map(it => [trunc(it.name, 32), String(it.qty), money(it.price), money(it.subtotal)]),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 2 : y + rowsH;

  doc.setFontSize(10);
  doc.text("TOTAL: " + money(opts.total), W - margin, y, { align: "right" });
  y += 6;
  doc.setFontSize(9);
  const methodLabel = opts.payMethod === "efectivo" ? "Efectivo" : (opts.payMethod === "tarjeta" ? "Tarjeta" : "Transferencia");
  doc.text("Método: " + methodLabel, margin, y); y += 5;
  doc.text("Recibido: " + money(opts.amount), margin, y); y += 5;
  doc.text("Vuelto: " + money(opts.change), margin, y); y += 7;

  doc.setFontSize(8);
  doc.text("¡Gracias por su compra!", W / 2, y, { align: "center" });
  if (opts.saleId) {
    y += 4;
    doc.text("Ticket: " + opts.saleId.slice(0, 8), W / 2, y, { align: "center" });
  }

  const file = "ticket-" + (opts.saleId ? opts.saleId.slice(0, 8) : "provisorio") + ".pdf";
  doc.save(file);
}

