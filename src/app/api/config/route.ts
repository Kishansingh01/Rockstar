import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const configs = await prisma.gameConfig.findMany();
    
    // Map configs to a key-value object
    const configMap = configs.reduce((acc: any, config: typeof configs[0]) => {
      acc[config.key] = config.value;
      return acc;
    }, {});

    return NextResponse.json({ success: true, config: configMap });
  } catch (error: any) {
    console.error('Error fetching config:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch configurations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { winner_share, admin_share, app_share, default_entry_fee } = body;

    // Validate inputs
    if (winner_share === undefined || admin_share === undefined || app_share === undefined) {
      return NextResponse.json({ error: 'winner_share, admin_share, and app_share are required' }, { status: 400 });
    }

    const w = parseFloat(winner_share);
    const a = parseFloat(admin_share);
    const ap = parseFloat(app_share);
    const defFee = default_entry_fee !== undefined ? parseFloat(default_entry_fee) : 100.0;

    if (isNaN(w) || isNaN(a) || isNaN(ap) || isNaN(defFee)) {
      return NextResponse.json({ error: 'All configuration values must be valid numbers' }, { status: 400 });
    }

    if (w + a + ap !== 100) {
      return NextResponse.json({ error: 'Winner, Admin, and App pool percentages must sum up to exactly 100%' }, { status: 400 });
    }

    // Save configurations inside a transaction
    await prisma.$transaction([
      prisma.gameConfig.upsert({
        where: { key: 'winner_share' },
        update: { value: w.toString() },
        create: { key: 'winner_share', value: w.toString(), description: 'Winner pool share percentage' },
      }),
      prisma.gameConfig.upsert({
        where: { key: 'admin_share' },
        update: { value: a.toString() },
        create: { key: 'admin_share', value: a.toString(), description: 'Admin pool share percentage' },
      }),
      prisma.gameConfig.upsert({
        where: { key: 'app_share' },
        update: { value: ap.toString() },
        create: { key: 'app_share', value: ap.toString(), description: 'App pool share percentage' },
      }),
      prisma.gameConfig.upsert({
        where: { key: 'default_entry_fee' },
        update: { value: defFee.toString() },
        create: { key: 'default_entry_fee', value: defFee.toString(), description: 'Default entry fee' },
      }),
    ]);

    return NextResponse.json({ success: true, message: 'Configurations updated successfully' });
  } catch (error: any) {
    console.error('Error updating configurations:', error);
    return NextResponse.json({ error: error.message || 'Failed to update configurations' }, { status: 500 });
  }
}
