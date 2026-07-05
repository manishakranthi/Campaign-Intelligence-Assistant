import { NextResponse } from "next/server";
import { listTicketsWithStatus } from "@/lib/campaign-service";

export const runtime = "nodejs";

export async function GET() {
  const tickets = await listTicketsWithStatus();
  return NextResponse.json({ tickets });
}
