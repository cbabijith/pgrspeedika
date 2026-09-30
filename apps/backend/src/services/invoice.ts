import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import type { Database } from "@pgrs/db";
import { settings } from "@pgrs/db";
import { formatINR, formatMinutes } from "@pgrs/contracts";
import type { OrderDTO } from "@pgrs/contracts";
import { tokens } from "@pgrs/config/tokens";
import { notFound } from "../lib/errors";

export interface ShopProfile {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressLine: string;
  gstin: string;
  openTime: string;
  closeTime: string;
}

export async function getShopProfile(db: Database): Promise<ShopProfile> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "shop.profile"));
  const value = (row?.value ?? {}) as Partial<ShopProfile>;
  return {
    name: value.name ?? "PGRS Peedika",
    tagline: value.tagline ?? "",
    phone: value.phone ?? "",
    whatsapp: value.whatsapp ?? "",
    email: value.email ?? "",
    addressLine: value.addressLine ?? "",
    gstin: value.gstin ?? "",
    openTime: value.openTime ?? "06:30",
    closeTime: value.closeTime ?? "21:30",
  };
}

const GREEN = tokens.color.primary;
const DARK = tokens.color.text;
const MUTED = tokens.color.muted;

export type DocumentKind = "invoice" | "slip";

/**
 * Build a GST-correct invoice or a packing slip as a PDF buffer.
 * Invoices show the final (weight-adjusted) amounts when packing is done.
 */
export async function buildOrderPdf(db: Database, order: OrderDTO, kind: DocumentKind): Promise<Buffer> {
  const shop = await getShopProfile(db);
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const effective = order.finalGrandTotalPaise ?? order.grandTotalPaise;

  // Header band
  doc.rect(0, 0, doc.page.width, 86).fill(GREEN);
  doc.fillColor("#FFFFFF").fontSize(20).font("Helvetica-Bold").text(shop.name, 48, 26);
  doc.fontSize(9).font("Helvetica").text(shop.tagline, 48, 52);
  doc.fontSize(9).text(shop.addressLine, 48, 66);
  doc.fontSize(9).text(`Phone ${shop.phone}`, 320, 52, { width: 230, align: "right" });
  if (shop.gstin) doc.text(`GSTIN ${shop.gstin}`, 320, 66, { width: 230, align: "right" });

  let y = 108;
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(14);
  doc.text(kind === "invoice" ? "TAX INVOICE" : "PACKING SLIP", 48, y);
  doc.font("Helvetica").fontSize(10).fillColor(MUTED);
  doc.text(`Order ${order.orderNumber}`, 320, y, { width: 230, align: "right" });
  doc.text(`Placed ${new Date(order.placedAt).toLocaleString("en-IN")}`, 320, y + 14, {
    width: 230,
    align: "right",
  });
  y += 34;

  // Customer + slot blocks
  doc.fillColor(DARK).fontSize(9);
  doc.font("Helvetica-Bold").text("Deliver to", 48, y);
  doc.font("Helvetica").fillColor(MUTED);
  doc.text(`${order.address.contactName} (${order.address.contactPhone})`, 48, y + 13);
  doc.text(order.address.line1, 48, y + 25);
  if (order.address.line2) doc.text(order.address.line2, 48, y + 37);
  doc.text(`${order.address.areaName}, ${order.address.city} - ${order.address.pincode}`, 48, y + 49);

  doc.font("Helvetica-Bold").fillColor(DARK).text("Delivery slot", 330, y);
  doc.font("Helvetica").fillColor(MUTED);
  doc.text(`${order.slotLabelEn}`, 330, y + 13);
  doc.text(order.slotDate, 330, y + 25);
  doc.text(
    `Payment: ${order.paymentMethod === "cod" ? "Cash on delivery" : "Paid online"} (${order.paymentStatus})`,
    330,
    y + 37,
  );
  y += 72;

  // Items table
  const cols = {
    item: 48,
    qty: 300,
    hsn: 380,
    rate: 440,
    amount: 520,
  };
  doc.rect(48, y, 500, 20).fill(GREEN);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
  doc.text("ITEM", cols.item + 4, y + 6);
  doc.text("QTY", cols.qty, y + 6);
  doc.text(kind === "invoice" ? "HSN / GST" : "PACKED", cols.hsn, y + 6);
  doc.text("RATE", cols.rate - 10, y + 6);
  doc.text("AMOUNT", cols.amount - 10, y + 6);
  y += 20;

  doc.font("Helvetica").fontSize(8).fillColor(DARK);
  for (const item of order.items) {
    const finalQty = item.finalQtyGrams ?? item.orderedQtyGrams;
    const qtyText =
      item.unitType === "weight"
        ? `${item.quantity} × ${item.unitLabelEn}`
        : `${item.quantity} × ${item.unitLabelEn}`;
    const packedText = item.unitType === "weight" ? `${finalQty} g packed` : `${finalQty} unit(s)`;
    const amount = item.finalLineTotalPaise ?? item.lineTotalPaise;
    if (y > 680) {
      doc.addPage();
      y = 60;
    }
    doc.text(`${item.nameEn} / ${item.nameMl}`, cols.item + 4, y + 5, { width: 245 });
    doc.text(qtyText, cols.qty, y + 5, { width: 75 });
    doc.text(kind === "invoice" ? `${item.hsnCode || "-"} / ${item.gstRate}%` : packedText, cols.hsn, y + 5, {
      width: 60,
    });
    doc.text(formatINR(item.unitPricePaise), cols.rate - 10, y + 5, { width: 70 });
    doc.text(formatINR(amount), cols.amount - 10, y + 5, { width: 76 });
    y += 26;
    doc
      .moveTo(48, y - 2)
      .lineTo(548, y - 2)
      .strokeColor("#E5E7EB")
      .stroke();
  }

  y += 10;
  const totalRow = (label: string, value: string, bold = false) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(bold ? DARK : MUTED)
      .fontSize(9);
    doc.text(label, 350, y, { width: 150, align: "right" });
    doc.text(value, 500, y, { width: 48, align: "right" });
    y += 15;
  };

  const subtotal = order.finalSubtotalPaise ?? order.subtotalPaise;
  totalRow("Subtotal", formatINR(subtotal));
  if (order.discountPaise > 0)
    totalRow(
      `Discount${order.couponCode ? ` (${order.couponCode})` : ""}`,
      `-${formatINR(order.discountPaise)}`,
    );
  totalRow("Delivery fee", formatINR(order.deliveryFeePaise));
  if (kind === "invoice") {
    for (const gst of order.gstBreakdown) {
      totalRow(`GST @${gst.rate}% (inclusive)`, formatINR(gst.taxPaise));
    }
  }
  if (order.weightAdjusted) {
    doc.fillColor("#F5A623").font("Helvetica-Bold").fontSize(8);
    doc.text("Bill adjusted for actual packed weight", 350, y, { width: 198, align: "right" });
    y += 13;
    doc.fillColor(MUTED).font("Helvetica").fontSize(9);
    totalRow("Original total", formatINR(order.grandTotalPaise));
  }
  totalRow("TOTAL", formatINR(effective), true);
  if (order.refundIssuedPaise > 0) totalRow("Refunded", `-${formatINR(order.refundIssuedPaise)}`);
  if (order.paymentMethod === "cod" && kind === "invoice") {
    totalRow("Collect on delivery", formatINR(effective), true);
  }

  // GST summary (invoice only, with valid GSTIN)
  if (kind === "invoice" && shop.gstin && order.gstBreakdown.length > 0) {
    y += 16;
    doc
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .fontSize(9)
      .text("GST summary (tax charged within MRP, inclusive)", 48, y);
    y += 14;
    doc.font("Helvetica").fillColor(MUTED).fontSize(8);
    doc.text("Rate", 48, y);
    doc.text("Taxable value", 130, y);
    doc.text("CGST", 300, y);
    doc.text("SGST", 390, y);
    doc.text("Total tax", 470, y);
    y += 12;
    for (const g of order.gstBreakdown) {
      doc.text(`${g.rate}%`, 48, y);
      doc.text(formatINR(g.taxableValuePaise), 130, y);
      doc.text(formatINR(Math.round(g.taxPaise / 2)), 300, y);
      doc.text(formatINR(g.taxPaise - Math.round(g.taxPaise / 2)), 390, y);
      doc.text(formatINR(g.taxPaise), 470, y);
      y += 12;
    }
  }

  // Footer
  doc.font("Helvetica").fillColor(MUTED).fontSize(8);
  doc.text(
    `Thank you for shopping with ${shop.name}. Fresh produce is weighed at packing; your bill reflects actual weights.`,
    48,
    760,
    { width: 500 },
  );
  doc.text(`Shop timings ${shop.openTime} – ${shop.closeTime}. For help: ${shop.phone}`, 48, 774, {
    width: 500,
  });
  void formatMinutes;

  doc.end();
  return done;
}

export async function buildInvoicePdf(db: Database, order: OrderDTO): Promise<Buffer> {
  if (!order.id) throw notFound("Order not found");
  return buildOrderPdf(db, order, "invoice");
}

export function buildSlipPdfBuilder(db: Database) {
  return (order: OrderDTO) => buildOrderPdf(db, order, "slip");
}
