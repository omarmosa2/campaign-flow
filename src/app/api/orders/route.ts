import { NextResponse } from "next/server";
import { failure } from "@/lib/http";
import { submitRequest } from "@/server/requests";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    return NextResponse.json(await submitRequest(req), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
