import { NextRequest, NextResponse } from 'next/server';
import { gameManager } from '@/lib/gameManager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId, entryFee } = body;

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }

    const customFee = entryFee !== undefined && entryFee !== '' ? parseFloat(entryFee) : undefined;
    const wheel = await gameManager.createWheel(adminId, customFee);

    return NextResponse.json({ success: true, wheel });
  } catch (error: any) {
    console.error('Error in create API:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
