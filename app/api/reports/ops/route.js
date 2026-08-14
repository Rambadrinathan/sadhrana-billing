import { isAuthed, getRole } from "@/lib/auth";
import { PROPERTY } from "@/lib/config";
import {
  buildInventoryReportPdf,
  buildExpensesReportPdf,
  buildAttendanceReportPdf,
  buildGuestsReportPdf,
  buildLeadsReportPdf,
  buildOpsPackPdf,
} from "@/lib/ops-reports-pdf";
import {
  buildInventoryExcel,
  buildExpensesExcel,
  buildAttendanceExcel,
  buildGuestsExcel,
  buildLeadsExcel,
} from "@/lib/ops-reports-excel";
import { listLocations } from "@/lib/inventory";
import { buildGstPackExcel } from "@/lib/gst-pack-excel";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/ops
 *   type=inventory|expenses|attendance|guests|leads|pack
 *   format=pdf|xlsx  (default pdf; pack is pdf only)
 *   location_id= (inventory)
 *   from=&to= (expenses, attendance, guests, leads)
 *   date= (attendance single day, if no from/to)
 *   status= (leads)
 */
export async function GET(request) {
  try {
    if (!isAuthed()) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "pack").toLowerCase();
    const format = (searchParams.get("format") || "pdf").toLowerCase();
    const locationId = searchParams.get("location_id") || null;
    const from = searchParams.get("from") || null;
    const to = searchParams.get("to") || null;
    const date = searchParams.get("date") || null;
    const status = searchParams.get("status") || null;

    let buf;
    let fname = "report";
    let contentType = "application/pdf";
    let ext = "pdf";

    if (format === "xlsx" || format === "excel") {
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";

      switch (type) {
        case "inventory": {
          let locationName = null;
          if (locationId) {
            const locs = await listLocations();
            locationName =
              locs.find((l) => l.id === locationId)?.name || "section";
            fname = `inventory-${locationName.replace(/[^\w]+/g, "-")}`;
          } else fname = "inventory-all-areas";
          buf = await buildInventoryExcel({ locationId });
          break;
        }
        case "expenses":
          fname = "expenses";
          buf = await buildExpensesExcel({ from, to });
          break;
        // The accountant's monthly pack. Owner-only: it carries every buyer's
        // GSTIN and the property's whole tax position.
        case "gst-pack":
        case "gstpack": {
          if (getRole() !== "admin") {
            return Response.json(
              { error: "Owner access required" },
              { status: 403 }
            );
          }
          fname = `gst-pack-${from || "start"}-to-${to || "end"}`;
          buf = await buildGstPackExcel({ from, to });
          break;
        }
        case "attendance":
          fname = "attendance";
          buf = await buildAttendanceExcel({ date, from, to });
          break;
        case "guests":
          fname = "guests";
          buf = await buildGuestsExcel({ from, to });
          break;
        case "leads":
          fname = "leads";
          buf = await buildLeadsExcel({ status, from, to });
          break;
        default:
          return Response.json(
            {
              error:
                "Excel not available for this type. Use type=inventory|expenses|attendance|guests|leads|gst-pack",
            },
            { status: 400 }
          );
      }
    } else {
      switch (type) {
        case "inventory": {
          let locationName = null;
          if (locationId) {
            const locs = await listLocations();
            locationName =
              locs.find((l) => l.id === locationId)?.name || "Section";
            fname = `inventory-${locationName.replace(/[^\w]+/g, "-")}`;
          } else fname = "inventory-all-areas";
          buf = await buildInventoryReportPdf({ locationId, locationName });
          break;
        }
        case "expenses":
          fname = "expenses";
          buf = await buildExpensesReportPdf({ from, to });
          break;
        case "attendance":
          fname = "attendance";
          buf = await buildAttendanceReportPdf({ date, from, to });
          break;
        case "guests":
          fname = "guests";
          buf = await buildGuestsReportPdf({ from, to });
          break;
        case "leads":
          fname = "leads";
          buf = await buildLeadsReportPdf({ status, from, to });
          break;
        case "pack":
        default:
          fname = "ops-pack";
          buf = await buildOpsPackPdf();
          break;
      }
    }

    const brand = (PROPERTY.tradeName || "Sadhrana")
      .replace(/[^\w]+/g, "-")
      .slice(0, 24);
    const filename = `${brand}-${fname}-${new Date().toISOString().slice(0, 10)}.${ext}`;

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition":
          ext === "pdf"
            ? `inline; filename="${filename}"`
            : `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (e) {
    console.error("ops report", e);
    return Response.json(
      { error: e.message || "Report failed" },
      { status: 500 }
    );
  }
}
