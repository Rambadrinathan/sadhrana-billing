/** Smoke-test CA series formatting (no DB). */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createJiti } from "jiti";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(fileURLToPath(import.meta.url), {
  alias: { "@": root },
});
const { caSeriesSpec, CA_SERIES_FLOOR, caFyLabels } = jiti(
  path.join(root, "lib/bill-no.js")
);

const labels = caFyLabels(new Date("2026-09-06T12:00:00+05:30"));
console.log("FY labels", labels);
const stay = caSeriesSpec("accommodation");
const fnb = caSeriesSpec("restaurant");
console.log("stay next after floor", stay.format(CA_SERIES_FLOOR.accommodation + 1));
console.log("fnb next after floor", fnb.format(CA_SERIES_FLOOR.restaurant + 1));
console.assert(stay.format(36) === "VJD/2026_27/036", stay.format(36));
console.assert(fnb.format(31) === "VJD/RS/26_27/031", fnb.format(31));
console.log("OK");
