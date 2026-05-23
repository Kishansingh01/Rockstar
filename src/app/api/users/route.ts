import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { role: 'desc' }, // Admin first
    });
    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, amount, username, role } = body;

    // Create a new user if requested
    if (username) {
      const newUser = await prisma.$transaction(async (tx: typeof prisma) => {
        const created = await tx.user.create({
          data: {
            username,
            role: role || 'USER',
            coins: amount || 1000.0,
          },
        });

        await tx.coinTransaction.create({
          data: {
            userId: created.id,
            amount: amount || 1000.0,
            type: 'INITIAL_CREDIT',
            description: `Initial wallet credit of ${amount || 1000.0} coins`,
          },
        });

        return created;
      });

      return NextResponse.json({ success: true, user: newUser });
    }

    // Otherwise update balance (e.g., Claim free coins)
    if (!userId || !amount) {
      return NextResponse.json({ error: 'userId and amount are required' }, { status: 400 });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: {
          coins: {
            increment: parseFloat(amount),
          },
        },
      });

      await tx.coinTransaction.create({
        data: {
          userId: userId,
          amount: parseFloat(amount),
          type: 'ADMIN_ADJUSTMENT',
          description: `Coins balance adjustment: ${parseFloat(amount) > 0 ? '+' : ''}${amount} coins`,
        },
      });

      return u;
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: any) {
    console.error('Error processing user transaction:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
