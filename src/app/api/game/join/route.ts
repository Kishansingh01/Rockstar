import { NextRequest, NextResponse } from 'next/server';
import { gameManager } from '@/lib/gameManager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    await gameManager.joinWheel(userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in join API:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
