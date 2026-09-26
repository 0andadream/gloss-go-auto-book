import { createFileRoute } from "@tanstack/react-router";
import { completePaidBooking } from "@/lib/booking.functions";

// Flutterwave calls this after every charge. Catches customers who pay but
// never return to the site (closed tab, lost connection).
export const Route = createFileRoute("/api/public/flutterwave-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const hash = request.headers.get("verif-hash");
        const secret = process.env['FLW_WEBHOOK_SECRET'];
        if (!secret || !hash || hash !== secret) {
          return new Response("Invalid signature", { status: 401 });
        }
        const body = await request.json().catch(() => null);
        if (body?.event === "charge.completed" && body?.data?.status === "successful" && body.data.tx_ref && body.data.id) {
          const result = await completePaidBooking(String(body.data.tx_ref), String(body.data.id));
          if (!result.ok && result.reason === "taken") {
            // Paid but the slot vanished — needs a human to refund/rebook.
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("activity_log").insert({
              message: `⚠️ Paid booking could not be placed (slot taken) · ref ${body.data.tx_ref} · refund or rebook manually`,
            });
          }
        }
        return new Response("ok");
      },
    },
  },
});
