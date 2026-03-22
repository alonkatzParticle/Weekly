import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({
    ANTHROPIC_API_KEY_length: process.env.ANTHROPIC_API_KEY?.length ?? 0,
    ANTHROPIC_API_KEY_set: !!process.env.ANTHROPIC_API_KEY,
    MONDAY_TOKEN_set: !!process.env.MONDAY_TOKEN,
  })
}
