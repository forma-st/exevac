import { NextResponse } from "next/server";
import { currentUser, destroySession } from "@/lib/auth";
import { audit } from "@/lib/security";

export async function POST(req: Request) {
  const u = await currentUser();
  if (u) await audit("LOGOUT", { userId: u.id, email: u.email });
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
