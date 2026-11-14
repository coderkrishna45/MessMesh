import { NextResponse } from 'next/server';
import { safeDemoDatabase } from '@/lib/accessPolicy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ enabled: safeDemoDatabase(process.env) });
}
