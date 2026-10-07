import { adminIsConfigured, isAdminRequest } from "@/lib/admin-auth";

export async function GET() {
  return Response.json({ authenticated: await isAdminRequest(), configured: adminIsConfigured() });
}
