import { providerStatus } from "@/lib/ai/providers";
export async function GET() {
  return Response.json(
    { providers: providerStatus(), mode: "base-font" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
