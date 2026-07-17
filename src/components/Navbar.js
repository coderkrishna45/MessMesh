'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { toast } from 'react-hot-toast';
import {
  Award,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  UtensilsCrossed,
  Trash2,
  Trophy,
  TrendingUp,
  RefreshCw,
  Bell,
  CheckCheck,
  Trash,
  Users,
} from 'lucide-react';

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simDate, setSimDate] = useState('');
  const [simDayName, setSimDayName] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('messmesh_notifications');
    if (stored) {
      try {
        setNotifications(JSON.parse(stored));
      } catch (e) {
        console.error('Error parsing notifications:', e);
      }
    }
  }, []);

  // Close panel on outside click / Escape (mousedown avoids overlay race with buttons)
  useEffect(() => {
    if (!bellOpen) return;

    const handlePointerDown = (event) => {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setBellOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setBellOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [bellOpen]);

  const addNotification = useCallback((text, type) => {
    const newNotif = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      text,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      unread: true,
    };
    setNotifications((prev) => {
      const updated = [newNotif, ...prev].slice(0, 20);
      localStorage.setItem('messmesh_notifications', JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;

    const { role, wing } = session.user;

    // Toast survives socket-driven full page reload
    const advancedDay = sessionStorage.getItem('dateAdvancedToast');
    if (advancedDay) {
      toast.success(`📅 Date advanced to ${advancedDay}`);
      addNotification(`📅 Date advanced to ${advancedDay}`, 'info');
      sessionStorage.removeItem('dateAdvancedToast');
    }

    // Warn students once per browser session when score falls below 70
    if (role === 'STUDENT' && session.user.cleanPlateScore < 70) {
      const warned = sessionStorage.getItem('messmesh_low_score_warned');
      if (!warned) {
        toast.error(
          `⚠️ Low clean plate score (${session.user.cleanPlateScore}/100)! Keep waste low to help your wing.`
        );
        addNotification(
          `⚠️ Low clean plate score (${session.user.cleanPlateScore}/100)! Keep waste low to help your wing.`,
          'error'
        );
        sessionStorage.setItem('messmesh_low_score_warned', 'true');
      }
    }

    fetchSimDate();

    // Same-origin default; set NEXT_PUBLIC_SOCKET_URL when API is on another host
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('date-simulated', (data) => {
      sessionStorage.setItem('dateAdvancedToast', data.dayOfWeek);
      window.location.reload();
    });

    socket.on('feast-unlocked', (data) => {
      if (role === 'STUDENT' && wing === data.wing) {
        toast.success('🎉 Your wing unlocked Premium Sunday Feast!');
        addNotification('🎉 Your wing unlocked Premium Sunday Feast!', 'success');
      } else if (role === 'WARDEN' && wing === data.wing) {
        toast.success(`🎉 ${data.wing} Premium Sunday Feast unlocked!`);
        addNotification(`🎉 ${data.wing} unlocked Premium Sunday Feast!`, 'success');
      }
    });

    socket.on('high-waste-logged', (data) => {
      if (role === 'WARDEN' && wing === data.wing) {
        const levelLabel = data.wasteLevel >= 5 ? 'Heavy' : 'Moderate';
        toast.error(`⚠️ High waste (${levelLabel}) in ${data.wing} by ${data.studentName}`);
        addNotification(
          `⚠️ High waste reported in ${data.wing} by ${data.studentName}`,
          'error'
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [status, session, addNotification]);

  const fetchSimDate = async () => {
    try {
      const res = await fetch('/api/admin/simulate-date');
      const data = await res.json();
      if (data.success) {
        setSimDate(data.date);
        setSimDayName(data.dayOfWeekName);
      }
    } catch (err) {
      console.error('Error fetching sim date:', err);
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/admin/simulate-date', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Clients reload via the date-simulated socket event
      }
    } catch (err) {
      console.error('Error advancing simulation date:', err);
    } finally {
      setSimulating(false);
    }
  };

  const markAllAsRead = () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, unread: false }));
      localStorage.setItem('messmesh_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    localStorage.removeItem('messmesh_notifications');
  };

  const toggleBell = () => {
    setBellOpen((open) => {
      const next = !open;
      if (next) markAllAsRead();
      return next;
    });
  };

  if (status === 'loading' || !session) return null;

  const { name, role, wing } = session.user;
  const isWarden = role === 'WARDEN';
  const unreadCount = notifications.filter((n) => n.unread).length;

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, allowed: ['STUDENT', 'WARDEN'] },
    {
      label: isWarden ? 'Meal Ratings' : 'Rate Meals',
      href: '/vote',
      icon: UtensilsCrossed,
      allowed: ['STUDENT', 'WARDEN'],
    },
    { label: 'Log Waste', href: '/waste-log', icon: Trash2, allowed: ['STUDENT'] },
    { label: 'Analytics', href: '/admin', icon: TrendingUp, allowed: ['WARDEN'] },
    { label: 'Students', href: '/warden/manage-students', icon: Users, allowed: ['WARDEN'] },
    { label: 'Leaderboard', href: '/leaderboard', icon: Trophy, allowed: ['STUDENT', 'WARDEN'] },
  ];

  const allowedItems = navItems.filter((item) => item.allowed.includes(role));

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  const typeDotClass = (type) => {
    if (type === 'success') return 'bg-emerald-primary';
    if (type === 'error') return 'bg-terracotta';
    return 'bg-amber-glow';
  };

  const typeBgClass = (type, unread) => {
    if (!unread) return 'bg-transparent';
    if (type === 'success') return 'bg-emerald-primary/5';
    if (type === 'error') return 'bg-terracotta/5';
    return 'bg-amber-glow/5';
  };

  const NotificationPanel = () => (
    <div
      className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-border bg-slate-card shadow-2xl shadow-black/40 z-[60] overflow-hidden"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-border/60 bg-charcoal-dark/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-emerald-primary" />
          <h4 className="font-bold text-xs text-white uppercase tracking-wider">Notifications</h4>
          {notifications.length > 0 && (
            <span className="rounded-full bg-slate-border/80 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
              {notifications.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {notifications.some((n) => n.unread) && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-emerald-primary hover:bg-emerald-primary/10 transition-all uppercase tracking-wider"
              title="Mark all read"
            >
              <CheckCheck className="h-3 w-3" />
              Read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={clearAllNotifications}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all uppercase tracking-wider"
              title="Clear all"
            >
              <Trash className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto overscroll-contain">
        {notifications.length > 0 ? (
          <ul className="divide-y divide-slate-border/30">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${typeBgClass(n.type, n.unread)}`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-slate-card ${typeDotClass(n.type)} ${
                    n.unread ? 'ring-white/10' : 'ring-transparent opacity-50'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs leading-relaxed text-left ${
                      n.unread ? 'text-slate-100 font-medium' : 'text-slate-400'
                    }`}
                  >
                    {n.text}
                  </p>
                  <span className="mt-1 block text-left text-[9px] text-slate-500">{n.timestamp}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-border/40 text-slate-500">
              <Bell className="h-4 w-4" />
            </div>
            <p className="text-xs text-slate-500 text-center">No notifications yet</p>
            <p className="text-[10px] text-slate-600 text-center">
              Feast unlocks, waste alerts & date changes appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const BellButton = ({ className = '' }) => (
    <button
      type="button"
      onClick={toggleBell}
      className={`relative flex items-center justify-center h-9 w-9 rounded-lg border border-slate-border bg-slate-card/50 hover:bg-slate-card/85 text-slate-400 hover:text-white transition-all cursor-pointer outline-none ${
        bellOpen ? 'bg-slate-card text-white ring-1 ring-emerald-primary/30' : ''
      } ${className}`}
      title="Notifications"
      aria-expanded={bellOpen}
      aria-haspopup="dialog"
    >
      <Bell className={`h-4 w-4 ${unreadCount > 0 ? 'text-white' : ''}`} />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-1 text-[9px] font-black text-white ring-2 ring-charcoal-dark">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );

  return (
    <nav className="border-b border-slate-border bg-slate-card/30 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center">
          <div
            className="flex items-center gap-2 cursor-pointer shrink-0"
            onClick={() => router.push('/dashboard')}
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-primary/10 flex items-center justify-center text-emerald-primary ring-1 ring-emerald-primary/20">
              <Award className="h-5 w-5" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-emerald-primary to-emerald-primary/80 bg-clip-text text-transparent">
              MessMesh
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-1">
            {allowedItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-primary/10 text-emerald-primary border-b-2 border-emerald-primary'
                      : 'text-slate-400 hover:text-white hover:bg-slate-card/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center gap-2.5 border border-slate-border bg-charcoal-dark/60 px-3.5 py-1.5 rounded-xl shrink-0">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider flex items-center gap-1.5 select-none">
              <span className="h-2 w-2 rounded-full bg-emerald-primary animate-pulse" />
              {simDayName || '...'} ({simDate || '...'})
            </span>
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="rounded bg-emerald-primary hover:bg-emerald-primary/90 disabled:opacity-40 px-2.5 py-1 text-[9px] font-black text-slate-950 uppercase tracking-wide transition-all active:scale-[0.96] flex items-center gap-1 select-none"
            >
              {simulating ? (
                <RefreshCw className="h-2.5 w-2.5 animate-spin text-slate-950" />
              ) : (
                'Next Day ➔'
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="relative" ref={bellRef}>
              <BellButton />
              {bellOpen && <NotificationPanel />}
            </div>

            <div className="hidden md:flex flex-col text-right">
              <span className="text-sm font-semibold text-white">{name}</span>
              <span className="text-[10px] text-slate-500 capitalize leading-none mt-0.5">
                {role.toLowerCase()} • {wing}
              </span>
            </div>

            <button
              onClick={handleSignOut}
              className="hidden md:flex items-center justify-center h-9 w-9 rounded-lg border border-slate-border bg-slate-card/50 hover:bg-slate-card/85 text-slate-400 hover:text-white transition-all outline-none"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex md:hidden items-center justify-center p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-card/50 outline-none"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-border/50 bg-charcoal-dark/95 backdrop-blur-lg px-4 pt-2 pb-4 space-y-3">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => {
                  setMobileMenuOpen(false);
                  router.push(item.href);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-primary/10 text-emerald-primary border-l-4 border-emerald-primary'
                    : 'text-slate-400 hover:text-white hover:bg-slate-card/50'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}

          <div className="flex items-center justify-between border border-slate-border bg-slate-card/10 p-3 rounded-xl">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-primary animate-pulse" />
              {simDayName || '...'}: {simDate || '...'}
            </span>
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="rounded bg-emerald-primary hover:bg-emerald-primary/90 disabled:opacity-40 px-3 py-1.5 text-[9px] font-black text-slate-950 uppercase tracking-wide transition-all active:scale-[0.96]"
            >
              {simulating ? 'Simulating...' : 'Next Day ➔'}
            </button>
          </div>

          <div className="border-t border-slate-border/50 pt-4 mt-2 flex items-center justify-between px-4">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">{name}</span>
              <span className="text-[10px] text-slate-500 capitalize">
                {role.toLowerCase()} • {wing}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg border border-slate-border bg-slate-card/50 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
