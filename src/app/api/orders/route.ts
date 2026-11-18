import { NextResponse } from "next/server";
import { failure } from "@/lib/http";
import { submitRequest } from "@/server/requests";
export async function POST(req: Request) {
  try {
    return NextResponse.json(await submitRequest(req), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
