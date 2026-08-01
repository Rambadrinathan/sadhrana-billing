/**
 * HTML → A4 PDF via headless Chrome.
 * Local: system Chrome/Edge.
 * Vercel: @sparticuz/chromium (must be externalized in next.config.js).
 */
import fs from "fs";
import path from "path";

function localChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdfBuffer(html) {
  const isServerless = Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV
  );

  // Dynamic import so local builds don't require chromium resolution at module load
  const puppeteer = (await import("puppeteer-core")).default;

  let browser;
  try {
    if (isServerless) {
      // Import from package root — not a nested path that bundlers relocate
      const chromiumMod = await import("@sparticuz/chromium");
      const chromium = chromiumMod.default || chromiumMod;

      // Prefer pack that ships bin/ next to package
      const execPath = await chromium.executablePath();
      if (!execPath) {
        throw new Error("Chromium executablePath returned empty");
      }

      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: execPath,
        headless: chromium.headless ?? true,
      });
    } else {
      const exe = localChromePath();
      if (!exe) {
        throw new Error(
          "Chrome not found for PDF generation. Install Chrome or set CHROME_PATH."
        );
      }
      browser = await puppeteer.launch({
        executablePath: exe,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--font-render-hinting=none",
          "--disable-dev-shm-usage",
        ],
      });
    }

    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: ["domcontentloaded", "networkidle0"],
      timeout: 60000,
    });
    try {
      await page.evaluateHandle("document.fonts.ready");
    } catch {
      /* fonts optional */
    }
    await new Promise((r) => setTimeout(r, 400));

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
