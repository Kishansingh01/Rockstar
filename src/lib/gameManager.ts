import { prisma } from './db';

export interface ParticipantState {
  userId: string;
  username: string;
  role: string;
  coins: number;
  eliminated: boolean;
  eliminationOrder: number | null;
}

export interface GameState {
  wheelId: string | null;
  status: 'IDLE' | 'CREATED' | 'ACTIVE' | 'SPINNING' | 'FINISHED' | 'ABORTED';
  entryFee: number;
  winnerPoolShare: number;
  adminPoolShare: number;
  appPoolShare: number;
  winnerPoolAccumulated: number;
  adminPoolAccumulated: number;
  appPoolAccumulated: number;
  countdown: number; // in seconds
  participants: ParticipantState[];
  eliminatedParticipants: string[]; // User IDs in order of elimination
  winnerId: string | null;
  winnerName: string | null;
  lastEliminatedId: string | null;
  lastEliminatedName: string | null;
  nextEliminationAt: number | null; // epoch timestamp
  eliminationSequence?: string[];
  currentEliminationIndex?: number;
}

export class GameManager {
  private state: GameState = {
    wheelId: null,
    status: 'IDLE',
    entryFee: 100.0,
    winnerPoolShare: 70.0,
    adminPoolShare: 20.0,
    appPoolShare: 10.0,
    winnerPoolAccumulated: 0.0,
    adminPoolAccumulated: 0.0,
    appPoolAccumulated: 0.0,
    countdown: 0,
    participants: [],
    eliminatedParticipants: [],
    winnerId: null,
    winnerName: null,
    lastEliminatedId: null,
    lastEliminatedName: null,
    nextEliminationAt: null,
  };

  private timerId: NodeJS.Timeout | null = null;
  private subscribers: Set<ReadableStreamDefaultController> = new Set();

  constructor() {
    // Attempt to recover the last active wheel state from database on startup
    this.recoverState();
  }

  // Get current game state
  public getState(): GameState {
    return { ...this.state };
  }

  // Subscribe to real-time events
  public subscribe(controller: ReadableStreamDefaultController) {
    this.subscribers.add(controller);
    
    // Immediately send current state as the initial event
    this.sendToClient(controller, 'init', this.getState());

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(controller);
    };
  }

  // Send event to a single subscriber
  private sendToClient(controller: ReadableStreamDefaultController, type: string, data: any) {
    try {
      controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch (e) {
      // Clean up failed connections
      this.subscribers.delete(controller);
    }
  }

  // Broadcast event to all subscribers
  private broadcast(type: string, data: any) {
    const payload = new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    for (const controller of this.subscribers) {
      try {
        controller.enqueue(payload);
      } catch (e) {
        this.subscribers.delete(controller);
      }
    }
  }

  // Recover active game state from DB on server startup/hot-reload
  private async recoverState() {
    try {
      // Find any active or created wheel
      const activeWheel = await prisma.spinWheel.findFirst({
        where: {
          status: {
            in: ['CREATED', 'ACTIVE', 'SPINNING'],
          },
        },
        include: {
          participants: {
            include: {
              user: true,
            },
          },
          winner: true,
        },
      });

      if (!activeWheel) {
        return;
      }

      this.state.wheelId = activeWheel.id;
      this.state.status = activeWheel.status as any;
      this.state.entryFee = activeWheel.entryFee;
      this.state.winnerPoolShare = activeWheel.winnerPoolShare;
      this.state.adminPoolShare = activeWheel.adminPoolShare;
      this.state.appPoolShare = activeWheel.appPoolShare;
      this.state.winnerPoolAccumulated = activeWheel.winnerPoolAccumulated;
      this.state.adminPoolAccumulated = activeWheel.adminPoolAccumulated;
      this.state.appPoolAccumulated = activeWheel.appPoolAccumulated;
      this.state.winnerId = activeWheel.winnerId;
      this.state.winnerName = activeWheel.winner?.username || null;

      this.state.participants = activeWheel.participants.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        role: p.user.role,
        coins: p.user.coins,
        eliminated: p.eliminatedAt !== null,
        eliminationOrder: p.eliminationOrder,
      }));

      this.state.eliminatedParticipants = activeWheel.participants
        .filter((p) => p.eliminatedAt !== null)
        .sort((a, b) => (a.eliminationOrder || 0) - (b.eliminationOrder || 0))
        .map((p) => p.userId);

      if (this.state.eliminatedParticipants.length > 0) {
        const lastElimId = this.state.eliminatedParticipants[this.state.eliminatedParticipants.length - 1];
        const lastElimP = this.state.participants.find((p) => p.userId === lastElimId);
        this.state.lastEliminatedId = lastElimId;
        this.state.lastEliminatedName = lastElimP?.username || null;
      }

      if (this.state.status === 'CREATED') {
        // Calculate remaining seconds based on 3 minutes from createdAt
        const elapsed = Math.floor((Date.now() - activeWheel.createdAt.getTime()) / 1000);
        const remaining = Math.max(0, 180 - elapsed);
        
        if (remaining > 0) {
          this.state.countdown = remaining;
          this.startCountdownTimer();
        } else {
          // If past 3 minutes and was CREATED, trigger the auto-start check
          this.state.countdown = 0;
          this.handleCountdownExpiry();
        }
      } else if (this.state.status === 'ACTIVE' || this.state.status === 'SPINNING') {
        // If it got interrupted during eliminations, let's just abort and refund to be safe,
        // or let's reset it to idle so the admin can make a new one, since active states rely on in-memory sequences.
        // We will abort and refund in DB to keep it clean.
        console.log(`Recovered interrupted active wheel ${activeWheel.id}. Refunding participants for consistency.`);
        await this.abortAndRefund();
      }

      this.broadcast('init', this.getState());
    } catch (e) {
      console.error('Error recovering state:', e);
    }
  }

  // Create a new spin wheel
  public async createWheel(adminId: string, customEntryFee?: number) {
    // Validate that only ONE active spin wheel exists at a time
    if (this.state.status !== 'IDLE' && this.state.status !== 'FINISHED' && this.state.status !== 'ABORTED') {
      throw new Error('Only ONE active spin wheel is allowed at a time!');
    }

    // Verify creator is an admin
    const creator = await prisma.user.findUnique({ where: { id: adminId } });
    if (!creator || creator.role !== 'ADMIN') {
      throw new Error('Only administrators can initialize a spin wheel!');
    }

    // Retrieve database configurations for pool percentages
    const winnerShareConfig = await prisma.gameConfig.findUnique({ where: { key: 'winner_share' } });
    const adminShareConfig = await prisma.gameConfig.findUnique({ where: { key: 'admin_share' } });
    const appShareConfig = await prisma.gameConfig.findUnique({ where: { key: 'app_share' } });
    const defaultEntryFeeConfig = await prisma.gameConfig.findUnique({ where: { key: 'default_entry_fee' } });

    const winnerShare = parseFloat(winnerShareConfig?.value || '70');
    const adminShare = parseFloat(adminShareConfig?.value || '20');
    const appShare = parseFloat(appShareConfig?.value || '10');
    const entryFee = customEntryFee ?? parseFloat(defaultEntryFeeConfig?.value || '100');

    if (winnerShare + adminShare + appShare !== 100) {
      throw new Error('System Configuration Error: Winner, Admin, and App pool shares must sum to 100%!');
    }

    // Create wheel in database
    const newWheel = await prisma.spinWheel.create({
      data: {
        status: 'CREATED',
        entryFee,
        winnerPoolShare: winnerShare,
        adminPoolShare: adminShare,
        appPoolShare: appShare,
        winnerPoolAccumulated: 0.0,
        adminPoolAccumulated: 0.0,
        appPoolAccumulated: 0.0,
      },
    });

    // Reset and set in-memory state
    this.state = {
      wheelId: newWheel.id,
      status: 'CREATED',
      entryFee,
      winnerPoolShare: winnerShare,
      adminPoolShare: adminShare,
      appPoolShare: appShare,
      winnerPoolAccumulated: 0.0,
      adminPoolAccumulated: 0.0,
      appPoolAccumulated: 0.0,
      countdown: 180, // 3 minutes
      participants: [],
      eliminatedParticipants: [],
      winnerId: null,
      winnerName: null,
      lastEliminatedId: null,
      lastEliminatedName: null,
      nextEliminationAt: null,
    };

    // Start countdown
    this.startCountdownTimer();

    // Broadcast update
    this.broadcast('state_changed', this.getState());
    return newWheel;
  }

  // Join spin wheel
  public async joinWheel(userId: string) {
    if (this.state.status !== 'CREATED' || !this.state.wheelId) {
      throw new Error('There is no active spin wheel open for joining.');
    }

    const wheelId = this.state.wheelId;

    // Use atomic transaction to handle joining, balance deductions, and pool distribution
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get user details
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found.');
      }

      // Check if already in the wheel
      const existingParticipant = await tx.spinWheelParticipant.findUnique({
        where: {
          spinWheelId_userId: {
            spinWheelId: wheelId,
            userId: userId,
          },
        },
      });

      if (existingParticipant) {
        throw new Error('You have already joined this spin wheel!');
      }

      // Check coin balance
      if (user.coins < this.state.entryFee) {
        throw new Error(`Insufficient coins! Entry fee is ${this.state.entryFee} coins.`);
      }

      // 2. Deduct entry fee
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          coins: {
            decrement: this.state.entryFee,
          },
        },
      });

      // Calculate shares
      const winnerPoolAmt = (this.state.entryFee * this.state.winnerPoolShare) / 100;
      const adminPoolAmt = (this.state.entryFee * this.state.adminPoolShare) / 100;
      const appPoolAmt = (this.state.entryFee * this.state.appPoolShare) / 100;

      // 3. Increment accumulations in the SpinWheel table
      const updatedWheel = await tx.spinWheel.update({
        where: { id: wheelId },
        data: {
          winnerPoolAccumulated: { increment: winnerPoolAmt },
          adminPoolAccumulated: { increment: adminPoolAmt },
          appPoolAccumulated: { increment: appPoolAmt },
        },
      });

      // 4. Create participant record
      await tx.spinWheelParticipant.create({
        data: {
          spinWheelId: wheelId,
          userId: userId,
        },
      });

      // 5. Record transaction log
      await tx.coinTransaction.create({
        data: {
          userId: userId,
          spinWheelId: wheelId,
          amount: -this.state.entryFee,
          type: 'ENTRY_FEE',
          description: `Paid entry fee for Spin Wheel ${wheelId}`,
        },
      });

      return {
        user: updatedUser,
        wheel: updatedWheel,
      };
    });

    // Update in-memory state
    this.state.winnerPoolAccumulated = result.wheel.winnerPoolAccumulated;
    this.state.adminPoolAccumulated = result.wheel.adminPoolAccumulated;
    this.state.appPoolAccumulated = result.wheel.appPoolAccumulated;

    this.state.participants.push({
      userId: result.user.id,
      username: result.user.username,
      role: result.user.role,
      coins: result.user.coins,
      eliminated: false,
      eliminationOrder: null,
    });

    // Broadcast participant join
    this.broadcast('joined', this.getState());
  }

  // Start the countdown timer
  private startCountdownTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }

    this.timerId = setInterval(() => {
      if (this.state.countdown > 0) {
        this.state.countdown -= 1;
        this.broadcast('tick', { countdown: this.state.countdown });
      } else {
        this.handleCountdownExpiry();
      }
    }, 1000);
  }

  // Handle auto-start expiry after 3 minutes
  private async handleCountdownExpiry() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    console.log(`Countdown expired for wheel ${this.state.wheelId}. Checking participants...`);

    if (this.state.participants.length < 3) {
      console.log(`Fewer than 3 participants (${this.state.participants.length}). Aborting and refunding.`);
      await this.abortAndRefund();
    } else {
      console.log(`Minimum participants met (${this.state.participants.length}). Starting game.`);
      await this.startGame();
    }
  }

  // Manually start spin wheel (by admin)
  public async manualStart(adminId: string) {
    if (this.state.status !== 'CREATED' || !this.state.wheelId) {
      throw new Error('There is no active spin wheel open for starting.');
    }

    // Verify creator is an admin
    const creator = await prisma.user.findUnique({ where: { id: adminId } });
    if (!creator || creator.role !== 'ADMIN') {
      throw new Error('Only administrators can manually start the spin wheel!');
    }

    if (this.state.participants.length < 3) {
      throw new Error(`Cannot start game. Minimum of 3 participants required (currently ${this.state.participants.length}).`);
    }

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    await this.startGame();
  }

  // Start the game loop
  private async startGame() {
    this.state.status = 'ACTIVE';
    this.state.countdown = 0;

    // Update wheel status in database
    await prisma.spinWheel.update({
      where: { id: this.state.wheelId! },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });

    // Generate random elimination sequence
    // The sequence includes all participant userIds, EXCEPT we shuffle them randomly.
    // The very last participant in the sequence will be the winner!
    const participantIds = this.state.participants.map((p) => p.userId);
    
    // Fisher-Yates Shuffle to randomize the array
    const shuffledIds = [...participantIds];
    for (let i = shuffledIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
    }

    // Save the randomized elimination sequence in-memory.
    // The first N-1 players in this array will be eliminated every 7 seconds.
    // The final index remains as the winner!
    this.state.eliminationSequence = shuffledIds;
    this.state.currentEliminationIndex = 0;
    this.state.eliminatedParticipants = [];
    this.state.lastEliminatedId = null;
    this.state.lastEliminatedName = null;

    this.broadcast('started', this.getState());

    // Start processing eliminations
    this.processNextElimination();
  }

  // Schedule or process elimination loop
  private processNextElimination() {
    const totalParticipants = this.state.participants.length;
    const eliminationIdx = this.state.currentEliminationIndex || 0;

    // If only one user remains, they are the winner!
    if (eliminationIdx >= totalParticipants - 1) {
      this.finalizeGame();
      return;
    }

    this.state.nextEliminationAt = Date.now() + 7000;
    this.broadcast('state_changed', this.getState());

    this.timerId = setTimeout(async () => {
      await this.eliminateUser();
      this.state.currentEliminationIndex = (this.state.currentEliminationIndex || 0) + 1;
      this.processNextElimination();
    }, 7000);
  }

  // Eliminate one user
  private async eliminateUser() {
    const idx = this.state.currentEliminationIndex || 0;
    const userIdToEliminate = this.state.eliminationSequence![idx];
    const wheelId = this.state.wheelId!;

    console.log(`Eliminating user ${userIdToEliminate} at index ${idx}`);

    // Update in database
    await prisma.spinWheelParticipant.update({
      where: {
        spinWheelId_userId: {
          spinWheelId: wheelId,
          userId: userIdToEliminate,
        },
      },
      data: {
        eliminatedAt: new Date(),
        eliminationOrder: idx + 1,
      },
    });

    // Update state
    this.state.eliminatedParticipants.push(userIdToEliminate);
    this.state.lastEliminatedId = userIdToEliminate;

    const participant = this.state.participants.find((p) => p.userId === userIdToEliminate);
    if (participant) {
      participant.eliminated = true;
      participant.eliminationOrder = idx + 1;
      this.state.lastEliminatedName = participant.username;
    }

    this.broadcast('eliminated', {
      lastEliminatedId: this.state.lastEliminatedId,
      lastEliminatedName: this.state.lastEliminatedName,
      eliminatedParticipants: this.state.eliminatedParticipants,
      participants: this.state.participants,
    });
  }

  // Finalize the game and distribute coins
  private async finalizeGame() {
    const totalParticipants = this.state.participants.length;
    const winnerId = this.state.eliminationSequence![totalParticipants - 1];
    const wheelId = this.state.wheelId!;

    console.log(`Game finalized. Winner: ${winnerId}`);

    try {
      // Database transaction to credit winner and admin, record transactions, and finalize wheel
      const result = await prisma.$transaction(async (tx) => {
        // Find admin user to credit owner pool.
        const admin = await tx.user.findFirst({
          where: { role: 'ADMIN' },
        });

        if (!admin) {
          throw new Error('Admin user not found in the database. Payout aborted.');
        }

        // 1. Update wheel status to FINISHED and set winner
        const updatedWheel = await tx.spinWheel.update({
          where: { id: wheelId },
          data: {
            status: 'FINISHED',
            winnerId: winnerId,
            endedAt: new Date(),
          },
        });

        // 2. Credit winner with winner pool
        const updatedWinner = await tx.user.update({
          where: { id: winnerId },
          data: {
            coins: {
              increment: updatedWheel.winnerPoolAccumulated,
            },
          },
        });

        // Record winner transaction
        await tx.coinTransaction.create({
          data: {
            userId: winnerId,
            spinWheelId: wheelId,
            amount: updatedWheel.winnerPoolAccumulated,
            type: 'WIN_PAYOUT',
            description: `Winner payout for Spin Wheel ${wheelId}`,
          },
        });

        // 3. Credit admin with admin pool
        const updatedAdmin = await tx.user.update({
          where: { id: admin.id },
          data: {
            coins: {
              increment: updatedWheel.adminPoolAccumulated,
            },
          },
        });

        // Record admin transaction
        await tx.coinTransaction.create({
          data: {
            userId: admin.id,
            spinWheelId: wheelId,
            amount: updatedWheel.adminPoolAccumulated,
            type: 'ADMIN_PAYOUT',
            description: `Admin commission from Spin Wheel ${wheelId}`,
          },
        });

        return {
          wheel: updatedWheel,
          winner: updatedWinner,
          admin: updatedAdmin,
        };
      });

      // Update in-memory state
      this.state.status = 'FINISHED';
      this.state.winnerId = winnerId;
      this.state.winnerName = result.winner.username;
      this.state.nextEliminationAt = null;

      // Update participant coin balances in-memory
      for (const p of this.state.participants) {
        if (p.userId === winnerId) {
          p.coins = result.winner.coins;
        } else if (p.role === 'ADMIN') {
          p.coins = result.admin.coins;
        }
      }

      this.broadcast('winner', this.getState());
    } catch (e) {
      console.error('Error finalising game payout:', e);
      this.state.status = 'FINISHED';
      this.broadcast('state_changed', this.getState());
    }
  }

  // Abort the wheel and refund all participants in an atomic transaction
  public async abortAndRefund() {
    if (!this.state.wheelId) return;

    const wheelId = this.state.wheelId;

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    try {
      console.log(`Refunding all participants for wheel ${wheelId}...`);

      await prisma.$transaction(async (tx) => {
        // Get all participants
        const participants = await tx.spinWheelParticipant.findMany({
          where: { spinWheelId: wheelId },
        });

        // Update wheel status to ABORTED
        await tx.spinWheel.update({
          where: { id: wheelId },
          data: { status: 'ABORTED' },
        });

        // Loop and refund each participant's entry fee
        for (const p of participants) {
          await tx.user.update({
            where: { id: p.userId },
            data: {
              coins: {
                increment: this.state.entryFee,
              },
            },
          });

          // Log refund transaction
          await tx.coinTransaction.create({
            data: {
              userId: p.userId,
              spinWheelId: wheelId,
              amount: this.state.entryFee,
              type: 'REFUND',
              description: `Entry fee refund for aborted Spin Wheel ${wheelId}`,
            },
          });
        }
      });

      // Update state
      this.state.status = 'ABORTED';
      this.state.countdown = 0;
      this.state.nextEliminationAt = null;

      // Reset coins for local state representation
      for (const p of this.state.participants) {
        p.coins += this.state.entryFee;
      }

      this.broadcast('aborted', this.getState());
    } catch (e) {
      console.error('Error during abort and refund:', e);
      this.state.status = 'ABORTED';
      this.broadcast('state_changed', this.getState());
    }
  }

  // Force clean up (useful when admin wants to reset or testing)
  public resetToIdle() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    this.state = {
      wheelId: null,
      status: 'IDLE',
      entryFee: 100.0,
      winnerPoolShare: 70.0,
      adminPoolShare: 20.0,
      appPoolShare: 10.0,
      winnerPoolAccumulated: 0.0,
      adminPoolAccumulated: 0.0,
      appPoolAccumulated: 0.0,
      countdown: 0,
      participants: [],
      eliminatedParticipants: [],
      winnerId: null,
      winnerName: null,
      lastEliminatedId: null,
      lastEliminatedName: null,
      nextEliminationAt: null,
    };

    this.broadcast('state_changed', this.getState());
  }
}

// Global caching for Next.js hot reloading
declare global {
  var gameManager: GameManager | undefined;
}

const gameManager = globalThis.gameManager || new GameManager();
if (process.env.NODE_ENV !== 'production') {
  globalThis.gameManager = gameManager;
}

export { gameManager };
