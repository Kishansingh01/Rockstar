'use strict';

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Coins, 
  User as UserIcon, 
  Settings, 
  ListFilter, 
  Play, 
  Trash2, 
  RefreshCw, 
  PlusCircle, 
  Info, 
  Bell, 
  ShieldAlert, 
  Crown,
  History,
  TrendingUp
} from 'lucide-react';

interface Participant {
  userId: string;
  username: string;
  role: string;
  coins: number;
  eliminated: boolean;
  eliminationOrder: number | null;
}

interface GameState {
  wheelId: string | null;
  status: 'IDLE' | 'CREATED' | 'ACTIVE' | 'SPINNING' | 'FINISHED' | 'ABORTED';
  entryFee: number;
  winnerPoolShare: number;
  adminPoolShare: number;
  appPoolShare: number;
  winnerPoolAccumulated: number;
  adminPoolAccumulated: number;
  appPoolAccumulated: number;
  countdown: number;
  participants: Participant[];
  eliminatedParticipants: string[];
  winnerId: string | null;
  winnerName: string | null;
  lastEliminatedId: string | null;
  lastEliminatedName: string | null;
  nextEliminationAt: number | null;
}

interface User {
  id: string;
  username: string;
  role: string;
  coins: number;
}

interface Transaction {
  id: string;
  userId: string;
  user: { username: string };
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

interface Toast {
  id: string;
  title: string;
  desc: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export default function Home() {
  // Application State
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    wheelId: null,
    status: 'IDLE',
    entryFee: 100,
    winnerPoolShare: 70,
    adminPoolShare: 20,
    appPoolShare: 10,
    winnerPoolAccumulated: 0,
    adminPoolAccumulated: 0,
    appPoolAccumulated: 0,
    countdown: 0,
    participants: [],
    eliminatedParticipants: [],
    winnerId: null,
    winnerName: null,
    lastEliminatedId: null,
    lastEliminatedName: null,
    nextEliminationAt: null,
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Form and input states
  const [customEntryFee, setCustomEntryFee] = useState<string>('100');
  const [winnerShareInput, setWinnerShareInput] = useState<string>('70');
  const [adminShareInput, setAdminShareInput] = useState<string>('20');
  const [appShareInput, setAppShareInput] = useState<string>('10');
  const [newUsername, setNewUsername] = useState<string>('');
  
  // Loading indicators
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // References for Wheel Canvas Animation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotationAngleRef = useRef<number>(0);
  const isSpinningRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const spinSpeedRef = useRef<number>(0.02);

  // 1. Fetch Users, Configurations, and Transaction ledger
  const loadUsers = async (selectNewId?: string) => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        if (data.users.length > 0) {
          if (selectNewId) {
            const matched = data.users.find((u: User) => u.id === selectNewId);
            if (matched) setSelectedUser(matched);
          } else if (!selectedUser) {
            setSelectedUser(data.users[0]);
          } else {
            // Update selected user balance in case it changed
            const matched = data.users.find((u: User) => u.id === selectedUser.id);
            if (matched) setSelectedUser(matched);
          }
        }
      }
    } catch (e) {
      console.error(e);
      addToast('Error', 'Failed to load users', 'error');
    }
  };

  const loadTransactions = async () => {
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success && data.config) {
        setWinnerShareInput(data.config.winner_share || '70');
        setAdminShareInput(data.config.admin_share || '20');
        setAppShareInput(data.config.app_share || '10');
        setCustomEntryFee(data.config.default_entry_fee || '100');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 2. Establish Real-time SSE Connection
  useEffect(() => {
    loadUsers();
    loadTransactions();
    loadConfig();

    const eventSource = new EventSource('/api/game/events');

    eventSource.addEventListener('init', (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      loadUsers();
      loadTransactions();
    });

    eventSource.addEventListener('state_changed', (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      loadUsers();
      loadTransactions();
    });

    eventSource.addEventListener('tick', (e) => {
      const data = JSON.parse(e.data);
      setGameState(prev => ({ ...prev, countdown: data.countdown }));
    });

    eventSource.addEventListener('joined', (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      
      // Get the latest joined user's name
      const latestJoined = data.participants[data.participants.length - 1];
      if (latestJoined) {
        addToast('Player Joined!', `${latestJoined.username} entered the arena.`, 'info');
      }
      loadUsers();
      loadTransactions();
    });

    eventSource.addEventListener('started', (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      addToast('Game Started!', 'The Wheel of Fortune has been set in motion!', 'success');
      loadUsers();
      loadTransactions();
    });

    eventSource.addEventListener('eliminated', (e) => {
      const data = JSON.parse(e.data);
      setGameState(prev => ({
        ...prev,
        lastEliminatedId: data.lastEliminatedId,
        lastEliminatedName: data.lastEliminatedName,
        eliminatedParticipants: data.eliminatedParticipants,
        participants: data.participants,
      }));
      
      addToast('ELIMINATION!', `${data.lastEliminatedName} has been eliminated from the wheel!`, 'warning');
      loadUsers();
      loadTransactions();
    });

    eventSource.addEventListener('winner', (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      addToast('CHAMPION CROWNED!', `${data.winnerName} won the Spin Wheel tournament! Payout distributed.`, 'success');
      loadUsers();
      loadTransactions();
    });

    eventSource.addEventListener('aborted', (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      addToast('Game Aborted!', 'Fewer than 3 participants. All entry fees have been refunded.', 'error');
      loadUsers();
      loadTransactions();
    });

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
    };

    return () => {
      eventSource.close();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Sync state variables in case selectedUser was updated by SSE payouts
  useEffect(() => {
    if (selectedUser && users.length > 0) {
      const matched = users.find(u => u.id === selectedUser.id);
      if (matched && matched.coins !== selectedUser.coins) {
        setSelectedUser(matched);
      }
    }
  }, [users]);

  // Toast System Helper
  const addToast = (title: string, desc: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, desc, type }]);
    
    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 3. Wheel Drawing and Animating (Canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const participants = gameState.participants;
    
    // If no participants, draw a sleek placeholder wheel
    if (participants.length === 0) {
      drawPlaceholderWheel(ctx, canvas.width, canvas.height);
      return;
    }

    // Determine animation modes
    if (gameState.status === 'ACTIVE' || gameState.status === 'SPINNING') {
      isSpinningRef.current = true;
      spinSpeedRef.current = 0.08; // Fast spin
    } else if (gameState.status === 'FINISHED' || gameState.status === 'IDLE' || gameState.status === 'ABORTED' || gameState.status === 'CREATED') {
      isSpinningRef.current = false;
      spinSpeedRef.current = 0.002; // Slow ambient spin
    }

    const drawLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update rotation angle
      rotationAngleRef.current += spinSpeedRef.current;
      if (rotationAngleRef.current >= Math.PI * 2) {
        rotationAngleRef.current -= Math.PI * 2;
      }

      drawSpinWheel(ctx, canvas.width, canvas.height, participants, rotationAngleRef.current);
      
      animationFrameRef.current = requestAnimationFrame(drawLoop);
    };

    drawLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState.participants, gameState.status]);

  // Draw Placeholder Wheel
  const drawPlaceholderWheel = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 12;

    // Draw background outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    // Slices (ambient glowing sectors)
    const sectors = 8;
    const arc = (Math.PI * 2) / sectors;
    for (let i = 0; i < sectors; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, i * arc, (i + 1) * arc);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(130, 71, 229, 0.05)' : 'rgba(255, 189, 61, 0.03)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.stroke();
    }

    // Centercap
    ctx.beginPath();
    ctx.arc(cx, cy, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#05070f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();
  };

  // Draw actual Spin Wheel with participants
  const drawSpinWheel = (
    ctx: CanvasRenderingContext2D, 
    w: number, 
    h: number, 
    participants: Participant[], 
    angle: number
  ) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 12;
    const total = participants.length;
    const arc = (Math.PI * 2) / total;

    // Harmonious neon palettes for slices
    const colors = [
      '#a78bfa', // Purple
      '#ffbd3d', // Gold
      '#22d3ee', // Cyan
      '#f472b6', // Pink
      '#34d399', // Emerald
      '#fb7185', // Coral
      '#60a5fa', // Blue
      '#fb923c', // Orange
    ];

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    for (let i = 0; i < total; i++) {
      const p = participants[i];
      const startAngle = i * arc;
      const endAngle = (i + 1) * arc;

      // Draw Sector slice
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, startAngle, endAngle);
      
      if (p.eliminated) {
        ctx.fillStyle = '#171c2a'; // Grey out eliminated players
      } else {
        ctx.fillStyle = colors[i % colors.length];
      }
      ctx.fill();

      // Border line between slices
      ctx.strokeStyle = 'rgba(5, 7, 15, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw participant name inside sector slice
      ctx.save();
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      
      if (p.eliminated) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.font = '500 11px Inter';
      } else {
        ctx.fillStyle = '#000000'; // Pure contrast
        ctx.font = 'bold 12px Outfit';
      }

      const text = p.username.length > 10 ? p.username.substring(0, 8) + '..' : p.username;
      ctx.fillText(text, r - 20, 0);
      ctx.restore();
    }

    ctx.restore();

    // Outer Chrome Border Ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Glowing border cap
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(130, 71, 229, 0.15)';
    ctx.lineWidth = 8;
    ctx.stroke();
  };

  // 4. API Event Actions
  const handleCreateWheel = async () => {
    if (!selectedUser || selectedUser.role !== 'ADMIN') {
      addToast('Permission Denied', 'Only Admins can initialize a spin wheel!', 'error');
      return;
    }

    setLoadingAction('create');
    try {
      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          adminId: selectedUser.id,
          entryFee: customEntryFee 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      
      addToast('Success', 'Spin Wheel successfully initialized!', 'success');
      loadTransactions();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleJoinWheel = async () => {
    if (!selectedUser) return;

    setLoadingAction('join');
    try {
      const res = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      
      addToast('Joined!', 'Paid entry fee and registered successfully.', 'success');
      loadUsers();
      loadTransactions();
    } catch (err: any) {
      addToast('Failed to Join', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStartWheel = async () => {
    if (!selectedUser || selectedUser.role !== 'ADMIN') return;

    setLoadingAction('start');
    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: selectedUser.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      
      loadTransactions();
    } catch (err: any) {
      addToast('Failed to Start', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAbortWheel = async () => {
    setLoadingAction('abort');
    try {
      const res = await fetch('/api/game/abort', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Abort failed');
      loadTransactions();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResetWheel = async () => {
    setLoadingAction('reset');
    try {
      const res = await fetch('/api/game/reset', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Reset failed');
      addToast('Reset Complete', 'Arena returned to IDLE state.', 'info');
      loadTransactions();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  // Claim Free Coins (+500)
  const handleClaimFreeCoins = async () => {
    if (!selectedUser) return;
    
    setLoadingAction('claim');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: selectedUser.id, 
          amount: 500.0 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to claim coins');
      
      addToast('Coins Credited!', '+500 Coins added to your wallet!', 'success');
      loadUsers();
      loadTransactions();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  // Create new player for multiplayer testing
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setLoadingAction('createUser');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: newUsername.trim(),
          role: 'USER',
          amount: 1000.0
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      
      addToast('Account Spawned!', `Created player '${data.user.username}' with 1000 coins.`, 'success');
      setNewUsername('');
      loadUsers(data.user.id);
      loadTransactions();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  // Update percentages in settings panel
  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    const w = parseFloat(winnerShareInput);
    const a = parseFloat(adminShareInput);
    const ap = parseFloat(appShareInput);

    if (isNaN(w) || isNaN(a) || isNaN(ap)) {
      addToast('Input Error', 'Config values must be valid numbers', 'error');
      return;
    }

    if (w + a + ap !== 100) {
      addToast('Math Error', 'Percentages must sum to exactly 100%', 'error');
      return;
    }

    setLoadingAction('config');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_share: w,
          admin_share: a,
          app_share: ap,
          default_entry_fee: parseFloat(customEntryFee)
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save configuration');
      
      addToast('Configuration Saved', 'Splits updated. Will apply to future wheels!', 'success');
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  // Switch Identity
  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const matched = users.find(u => u.id === e.target.value);
    if (matched) {
      setSelectedUser(matched);
      addToast('Identity Shift', `Logged in as ${matched.username} (${matched.role})`, 'info');
    }
  };

  // Game Status Formatter
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'CREATED':
        return <span className="status-badge badge-created">Open for Entry</span>;
      case 'ACTIVE':
      case 'SPINNING':
        return <span className="status-badge badge-active">Tournament Running</span>;
      case 'FINISHED':
        return <span className="status-badge badge-finished">Completed</span>;
      case 'ABORTED':
        return <span className="status-badge badge-aborted">Aborted & Refunded</span>;
      default:
        return <span className="status-badge badge-idle">Idle</span>;
    }
  };

  // Helper boolean logic
  const isJoined = gameState.participants.some(p => p.userId === selectedUser?.id);
  const minParticipantsMet = gameState.participants.length >= 3;
  const isSelectedAdmin = selectedUser?.role === 'ADMIN';

  return (
    <main className="app-container">
      {/* 1. Header with Identity Switcher & Wallet */}
      <header className="header">
        <div className="logo-section">
          <div className="logo-icon">R</div>
          <div>
            <h1 className="logo-text">ROXSTAR</h1>
            <span className="logo-tag">Spin Wheel System</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {selectedUser && (
            <div className="wallet-box">
              <span className="form-label" style={{ margin: 0, fontSize: '0.8rem' }}>
                {selectedUser.username.toUpperCase()} Wallet:
              </span>
              <span className="wallet-coins">
                <Coins size={18} style={{ color: 'var(--accent-gold)' }} />
                {selectedUser.coins.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <button 
                onClick={handleClaimFreeCoins} 
                disabled={loadingAction === 'claim'}
                className="btn btn-primary"
                style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem' }}
                title="Claim free test coins"
              >
                <PlusCircle size={14} />
                +500 Coins
              </button>
            </div>
          )}

          <div className="user-switch-bar">
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <UserIcon size={14} /> Switch Character:
            </span>
            <select 
              value={selectedUser?.id || ''} 
              onChange={handleUserChange}
              className="select-dropdown"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Layout (Grid) */}
      <div className="dashboard-grid">
        
        {/* Left Column: The Tournament Arena */}
        <section className="glass-panel" style={{ minHeight: '580px' }}>
          <div className="panel-header">
            <h2 className="panel-title">
              <TrendingUp size={20} style={{ color: 'var(--accent-gold)' }} />
              Tournament Arena
            </h2>
            {renderStatusBadge(gameState.status)}
          </div>

          <div className="arena-layout">
            
            {/* Animated Canvas Spin Wheel */}
            <div className="wheel-wrapper">
              <div className="wheel-pointer"></div>
              <canvas 
                ref={canvasRef} 
                width={320} 
                height={320} 
                className="wheel-canvas"
              />
              <div className="wheel-center-cap">
                {gameState.status === 'ACTIVE' || gameState.status === 'SPINNING' ? '👑' : '⭐'}
              </div>
            </div>

            {/* Payout Pools Breakdown */}
            <div className="pools-grid">
              <div className="pool-card" style={{ borderLeft: '3px solid var(--accent-gold)' }}>
                <span className="pool-label">Winner Pool</span>
                <span className="pool-amount" style={{ color: 'var(--accent-gold)' }}>
                  {gameState.winnerPoolAccumulated.toLocaleString('en-US')}
                </span>
                <span className="pool-share">Winner Share: {gameState.winnerPoolShare}%</span>
              </div>
              <div className="pool-card" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
                <span className="pool-label">Owner Commission</span>
                <span className="pool-amount" style={{ color: 'var(--accent-purple)' }}>
                  {gameState.adminPoolAccumulated.toLocaleString('en-US')}
                </span>
                <span className="pool-share">Admin Share: {gameState.adminPoolShare}%</span>
              </div>
              <div className="pool-card" style={{ borderLeft: '3px solid var(--accent-cyan)' }}>
                <span className="pool-label">App Treasury</span>
                <span className="pool-amount" style={{ color: 'var(--accent-cyan)' }}>
                  {gameState.appPoolAccumulated.toLocaleString('en-US')}
                </span>
                <span className="pool-share">Platform Share: {gameState.appPoolShare}%</span>
              </div>
            </div>

            {/* In-Play Status Display */}
            <div className="status-box">
              {gameState.status === 'IDLE' && (
                <div>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                    Arena is Idle
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {isSelectedAdmin 
                      ? 'You are logged in as Admin. Configure the entry fee and initialize the tournament below!' 
                      : 'Waiting for an administrator to open the next Spin Wheel tournament.'}
                  </p>
                </div>
              )}

              {gameState.status === 'CREATED' && (
                <div>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
                    Auto-Start: {Math.floor(gameState.countdown / 60)}m {gameState.countdown % 60}s
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Registration Open. Entry Fee: <strong style={{ color: '#fff' }}>{gameState.entryFee} coins</strong>.
                  </p>
                  
                  {/* Dynamic Action Buttons */}
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    {!isJoined ? (
                      <button 
                        onClick={handleJoinWheel}
                        disabled={loadingAction === 'join'}
                        className="btn btn-primary"
                      >
                        <Coins size={16} />
                        Pay {gameState.entryFee} Coins & Register
                      </button>
                    ) : (
                      <div className="badge-finished" style={{ padding: '0.6rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600 }}>
                        ✓ Registered and Ready!
                      </div>
                    )}

                    {isSelectedAdmin && (
                      <>
                        <button 
                          onClick={handleStartWheel}
                          disabled={!minParticipantsMet || loadingAction === 'start'}
                          className={`btn btn-purple ${!minParticipantsMet ? 'btn-disabled' : ''}`}
                          title={!minParticipantsMet ? 'Need at least 3 participants' : 'Start now'}
                        >
                          <Play size={16} />
                          Force Start ({gameState.participants.length}/3 Joined)
                        </button>

                        <button 
                          onClick={handleAbortWheel}
                          disabled={loadingAction === 'abort'}
                          className="btn btn-danger"
                        >
                          <Trash2 size={16} />
                          Abort & Refund
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {(gameState.status === 'ACTIVE' || gameState.status === 'SPINNING') && (
                <div>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', color: '#ff2a5f', marginBottom: '0.25rem', animation: 'pulse 1s infinite' }}>
                    🚨 Elimination in progress... 🚨
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Next slice elimination scheduled every 7 seconds. Hold on to your wallets!
                  </p>
                  {gameState.lastEliminatedName && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', padding: '0.5rem 1rem', borderRadius: '8px', marginTop: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>
                      ☠ Last eliminated: {gameState.lastEliminatedName}
                    </div>
                  )}
                </div>
              )}

              {gameState.status === 'FINISHED' && (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255, 189, 61, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--accent-gold)' }}>
                      <Crown size={32} style={{ color: 'var(--accent-gold)' }} />
                    </div>
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.6rem', color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
                    👑 WINNER: {gameState.winnerName}! 👑
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Winner was credited with <strong style={{ color: '#fff' }}>{gameState.winnerPoolAccumulated} coins</strong>. Admin received owner cut.
                  </p>
                  
                  {isSelectedAdmin && (
                    <button 
                      onClick={handleResetWheel} 
                      disabled={loadingAction === 'reset'}
                      className="btn btn-purple" 
                      style={{ marginTop: '1rem' }}
                    >
                      <RefreshCw size={16} />
                      Reset Arena (IDLE)
                    </button>
                  )}
                </div>
              )}

              {gameState.status === 'ABORTED' && (
                <div>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', color: '#ef4444', marginBottom: '0.25rem' }}>
                    ⚠️ Game Aborted & Refunded ⚠️
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Participants limit (less than 3) was not reached or the administrator cancelled the tournament. All entry coins were atomicly refunded.
                  </p>
                  {isSelectedAdmin && (
                    <button 
                      onClick={handleResetWheel} 
                      disabled={loadingAction === 'reset'}
                      className="btn btn-purple" 
                      style={{ marginTop: '1rem' }}
                    >
                      <RefreshCw size={16} />
                      Reset Arena (IDLE)
                    </button>
                  )}
                </div>
              )}

            </div>

            {/* Admin Initialise Form (Render when Idle) */}
            {gameState.status === 'IDLE' && isSelectedAdmin && (
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.5rem' }}>
                <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '1rem', color: 'var(--accent-gold)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Settings size={16} />
                  Initialize New Wheel (Admin)
                </h4>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flexGrow: 1 }}>
                    <label className="form-label">Custom Entry Fee (Coins)</label>
                    <input 
                      type="number" 
                      value={customEntryFee}
                      onChange={(e) => setCustomEntryFee(e.target.value)}
                      className="form-input" 
                      placeholder="e.g. 100" 
                    />
                  </div>
                  <button 
                    onClick={handleCreateWheel}
                    disabled={loadingAction === 'create'}
                    className="btn btn-primary"
                    style={{ height: '42px' }}
                  >
                    Create & Open Entry
                  </button>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* Right Column: Participants List & Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Active Participants Panel */}
          <section className="glass-panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <ListFilter size={20} style={{ color: 'var(--accent-purple)' }} />
                Participants ({gameState.participants.length})
              </h2>
              <span className="pool-share" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                Active: {gameState.participants.filter(p => !p.eliminated).length}
              </span>
            </div>

            <div className="participant-list">
              {gameState.participants.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <Info size={24} style={{ display: 'block', margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  No participants registered yet.
                </div>
              ) : (
                gameState.participants.map((p) => (
                  <div 
                    key={p.userId} 
                    className={`participant-row ${p.eliminated ? 'eliminated' : ''}`}
                  >
                    <div className="participant-info">
                      <div className="participant-avatar">
                        {p.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="participant-name">{p.username}</div>
                        <span style={{ fontSize: '0.75rem', color: p.role === 'ADMIN' ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                          {p.role === 'ADMIN' ? '🛡 Admin' : 'Player'}
                        </span>
                      </div>
                    </div>

                    <div className="participant-meta">
                      {p.eliminated ? (
                        <span className="eliminated-badge">Eliminated #{p.eliminationOrder}</span>
                      ) : (
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                          IN PLAY
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Quick Multiplayer Generator Panel (Great for testing!) */}
          <section className="glass-panel">
            <div className="panel-header">
              <h2 className="panel-title">
                <PlusCircle size={20} style={{ color: 'var(--accent-cyan)' }} />
                Spawn Player (Sandbox)
              </h2>
            </div>
            
            <form onSubmit={handleCreateUser} className="settings-form">
              <div className="form-group">
                <label className="form-label">Unique Player Username</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="form-input" 
                    placeholder="e.g. fiona, gary" 
                    style={{ flexGrow: 1 }}
                    maxLength={15}
                  />
                  <button 
                    type="submit" 
                    disabled={loadingAction === 'createUser'}
                    className="btn btn-purple"
                    style={{ padding: '0.75rem' }}
                  >
                    Spawn
                  </button>
                </div>
              </div>
            </form>
          </section>

        </div>
      </div>

      {/* 3. Bottom Columns (Ledger Panel & Settings panel) */}
      <div className="bottom-sections">
        
        {/* Real-time Ledger */}
        <section className="glass-panel" style={{ gridColumn: 'span 1' }}>
          <div className="panel-header">
            <h2 className="panel-title">
              <History size={20} style={{ color: 'var(--accent-cyan)' }} />
              Database Coin Ledger (Atomic Logs)
            </h2>
          </div>

          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Username</th>
                  <th>Type</th>
                  <th>Coins Flow</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      No ledger transactions loaded.
                    </td>
                  </tr>
                ) : (
                  transactions.slice(0, 8).map((tx) => (
                    <tr key={tx.id} className="ledger-row">
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ fontWeight: 600 }}>{tx.user?.username || 'System'}</td>
                      <td>
                        <span className={`ledger-badge tx-${tx.type.toLowerCase()}`}>
                          {tx.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={tx.amount > 0 ? 'amount-positive' : 'amount-negative'}>
                        {tx.amount > 0 ? `+${tx.amount.toFixed(1)}` : `${tx.amount.toFixed(1)}`}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {tx.description}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Database Config Settings (Only available to Admin) */}
        <section className="glass-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Settings size={20} style={{ color: 'var(--accent-gold)' }} />
              Adjust Pool Splits (Database-Driven)
            </h2>
            {!isSelectedAdmin && (
              <span className="eliminated-badge" style={{ color: 'var(--accent-gold)', background: 'rgba(255,189,61,0.1)' }}>
                View-Only (Switch to Admin to edit)
              </span>
            )}
          </div>

          <form onSubmit={handleUpdateConfig} className="settings-form">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Winner Share (X%)</label>
                <input 
                  type="number" 
                  value={winnerShareInput}
                  onChange={(e) => setWinnerShareInput(e.target.value)}
                  className="form-input" 
                  min="0"
                  max="100"
                  disabled={!isSelectedAdmin}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Admin Share (Y%)</label>
                <input 
                  type="number" 
                  value={adminShareInput}
                  onChange={(e) => setAdminShareInput(e.target.value)}
                  className="form-input" 
                  min="0"
                  max="100"
                  disabled={!isSelectedAdmin}
                />
              </div>
              <div className="form-group">
                <label className="form-label">App Share (Z%)</label>
                <input 
                  type="number" 
                  value={appShareInput}
                  onChange={(e) => setAppShareInput(e.target.value)}
                  className="form-input" 
                  min="0"
                  max="100"
                  disabled={!isSelectedAdmin}
                />
              </div>
            </div>

            <div className="pool-share" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Info size={14} style={{ color: 'var(--accent-gold)' }} />
              <span>
                Total Split Sum: <strong>{parseFloat(winnerShareInput || '0') + parseFloat(adminShareInput || '0') + parseFloat(appShareInput || '0')}%</strong> (Must equal exactly 100%)
              </span>
            </div>

            {isSelectedAdmin && (
              <button 
                type="submit" 
                disabled={loadingAction === 'config'}
                className="btn btn-purple"
                style={{ width: '100%' }}
              >
                Apply Pool Configuration (Saves to DB)
              </button>
            )}
          </form>
        </section>

      </div>

      {/* 4. Real-time Glowing Toast Notifications */}
      <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', zIndex: 1000 }}>
        {toasts.map((toast) => (
          <div 
            key={toast.id} 
            className="glowing-toast"
            style={{ 
              borderColor: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : toast.type === 'warning' ? '#f59e0b' : 'var(--accent-purple)',
              boxShadow: toast.type === 'success' ? '0 0 20px rgba(16,185,129,0.3)' : toast.type === 'error' ? '0 0 20px rgba(239,68,68,0.3)' : toast.type === 'warning' ? '0 0 20px rgba(245,158,11,0.3)' : '0 0 20px rgba(130,71,229,0.3)'
            }}
          >
            <div className="glowing-toast-content">
              <div className="glowing-toast-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {toast.type === 'success' ? '🎉' : toast.type === 'error' ? '⚠️' : toast.type === 'warning' ? '☠' : '🔔'}
                {toast.title}
              </div>
              <div className="glowing-toast-desc">{toast.desc}</div>
            </div>
            <button className="glowing-toast-close" onClick={() => removeToast(toast.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

    </main>
  );
}
