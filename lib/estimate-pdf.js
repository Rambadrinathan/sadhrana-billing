/**
 * Stay estimate PDF for the app's "Estimate PDF" button.
 *
 * Production (Vercel): reliable pdf-lib branded A4 (no Chromium packaging issues).
 * Local / ESTIMATE_PDF_ENGINE=html: HTML design via Chrome (pixel-perfect template).
 */
import { renderEstimateHtml } from "@/lib/estimate-html";
import { htmlToPdfBuffer } from "@/lib/html-to-pdf";
import { buildEstimatePdfLib } from "@/lib/estimate-pdf-lib";

/**
 * @param {object} lead - enriched lead
 * @returns {Promise<Buffer>}
 */
export async function buildEstimatePdf(lead) {
  const preferHtml =
    process.env.ESTIMATE_PDF_ENGINE === "html" ||
    (!process.env.VERCEL && process.env.ESTIMATE_PDF_ENGINE !== "pdflib");

  if (preferHtml) {
    try {
      const html = renderEstimateHtml(lead);
      return await htmlToPdfBuffer(html);
    } catch (e) {
      console.error("HTML estimate PDF failed, using pdf-lib:", e?.message || e);
    }
  }

  // Always works on Vercel serverless
  return buildEstimatePdfLib(lead);
}

export { renderEstimateHtml };
