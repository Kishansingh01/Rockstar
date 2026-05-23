import { NextRequest } from 'next/server';
import { gameManager } from '@/lib/gameManager';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const responseStream = new ReadableStream({
    start(controller) {
      // Subscribe this connection to game state changes
      const unsubscribe = gameManager.subscribe(controller);

      // Listen for client disconnect and unsubscribe
      request.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
