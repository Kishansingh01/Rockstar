import { NextRequest, NextResponse } from 'next/server';
import { gameManager } from '@/lib/gameManager';

export async function POST(request: NextRequest) {
  try {
    gameManager.resetToIdle();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in reset API:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
