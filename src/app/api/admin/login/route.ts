import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, adminIsConfigured, createAdminToken, validAdminCredentials } from "@/lib/admin-auth";

export async function POST(request: Request) {
  if (!adminIsConfigured()) return NextResponse.json({ error: "بيانات دخول الأدمن غير مهيأة في الخادم." }, { status: 503 });
  const body = await request.json() as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!validAdminCredentials(username, password)) {
    return NextResponse.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, createAdminToken(), adminCookieOptions());
  return response;
}
