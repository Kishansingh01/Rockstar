import { NextRequest, NextResponse } from 'next/server';
import { gameManager } from '@/lib/gameManager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId } = body;

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }

    await gameManager.manualStart(adminId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in start API:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
