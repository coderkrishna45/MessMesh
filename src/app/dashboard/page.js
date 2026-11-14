'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { toast } from 'react-hot-toast';
import { generateWeeklyReportPDF } from '@/lib/generateWeeklyReport';
import { 
  Vote, 
  Trash2, 
  Trophy, 
  Settings, 
  User as UserIcon, 
  Award,
  TrendingUp,
  Users,
  CalendarDays,
  UtensilsCrossed,
  History,
  Sparkles,
  Lock,
  Target,
  Zap,
  RefreshCw,
  FileDown,
  Download,
  UserPlus
} from 'lucide-react';

export default function DashboardPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [wingStats, setWingStats] = useState(null);
  const [wingLoading, setWingLoading] = useState(false);
  const [liveScore, setLiveScore] = useState(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
    if (session?.user?.role === 'ADMIN') router.replace('/admin');
  }, [status, session?.user?.role, router]);

  // Live Clean Plate Score (JWT can be stale after weekly Monday reset)
  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'STUDENT') return;
    fetch('/api/student/score')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setLiveScore(data.cleanPlateScore);
          if (data.cleanPlateScore !== session.user.cleanPlateScore) {
            update({ cleanPlateScore: data.cleanPlateScore });
          }
        }
      })
      .catch(() => {});
  }, [status, session?.user?.role, session?.user?.cleanPlateScore, update]);

  useEffect(() => {
    if (session?.user?.role === 'WARDEN') {
      setStatsLoading(true);
      fetch('/api/admin/stats')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setStats(data.stats);
          }
        })
        .catch((err) => console.error('Error fetching admin stats:', err))
        .finally(() => setStatsLoading(false));
    }
  }, [session]);

  const handleDownloadWeeklyReport = async () => {
    setReportLoading(true);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to load report data.');
        return;
      }
      const fileName = generateWeeklyReportPDF(data, {
        wardenName: session?.user?.name,
        wardenWing: session?.user?.wing,
      });
      toast.success(`Report downloaded: ${fileName}`);
    } catch (err) {
      console.error('Weekly report error:', err);
      toast.error('Could not generate the weekly PDF report.');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === 'STUDENT') {
      setWingLoading(true);
      fetch('/api/leaderboard')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            const studentWing = session.user.wing;
            const match = data.wingLeaderboard.find((w) => w.wing === studentWing);
            setWingStats(match);
          }
        })
        .catch((err) => console.error('Error fetching wing stats:', err))
        .finally(() => setWingLoading(false));
    }
  }, [session]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!session) return null;

  const { name, role, wing } = session.user;
  const cleanPlateScore =
    liveScore ?? session.user.cleanPlateScore ?? 0;

  const getBadgeIconAndColor = (score) => {
    if (score >= 90) return { label: 'Eco Champion', color: 'text-emerald-primary border-emerald-primary/30 bg-emerald-primary/10', icon: Sparkles };
    if (score >= 75) return { label: 'Conserver', color: 'text-amber-glow border-amber-glow/30 bg-amber-glow/10', icon: Target };
    return { label: 'Minimizer', color: 'text-terracotta border-terracotta/30 bg-terracotta/10', icon: Zap };
  };

  const getProgressBarColor = (score) => {
    if (score >= 90) return 'bg-emerald-primary';
    if (score >= 75) return 'bg-amber-glow';
    return 'bg-terracotta';
  };

  const cards = [
    {
      title: "Rate Today's Meals",
      description: 'Submit 1-5 star reviews on the taste of today\'s dishes in real-time.',
      icon: Vote,
      href: '/vote',
      color: 'from-emerald-primary to-emerald-primary/80',
      textColor: 'text-emerald-primary',
      allowed: ['STUDENT'],
    },
    {
      title: "Monitor Meal Ratings",
      description: 'View real-time taste rating logs and audit summaries submitted by students.',
      icon: Vote,
      href: '/vote',
      color: 'from-emerald-primary to-emerald-primary/80',
      textColor: 'text-emerald-primary',
      allowed: ['WARDEN'],
    },
    {
      title: 'Log Waste',
      description: 'Log your plate waste after meals. Clean plates earn points and improve your wing ranking.',
      icon: Trash2,
      href: '/waste-log',
      color: 'from-blue-500 to-indigo-500',
      textColor: 'text-blue-400',
      allowed: ['STUDENT'],
    },
    {
      title: 'My Rating History',
      description: 'Review your taste review history matrix and trend indices across past weeks.',
      icon: History,
      href: '/vote',
      color: 'from-purple-500 to-pink-500',
      textColor: 'text-purple-400',
      allowed: ['STUDENT'],
    },
    {
      title: 'Analytics',
      description: 'View comprehensive waste logs, forecasting models, and trend charts.',
      icon: TrendingUp,
      href: '/admin',
      color: 'from-purple-500 to-pink-500',
      textColor: 'text-purple-400',
      allowed: ['WARDEN'],
    },
    {
      title: 'Generate Menu',
      description: 'Run the menu generation algorithm to finalize next week\'s menu using voting results.',
      icon: Settings,
      href: '/admin',
      color: 'from-terracotta to-terracotta/80',
      textColor: 'text-terracotta',
      allowed: ['WARDEN'],
    },
    {
      title: 'Manage Students',
      description: 'Register students manually or via CSV bulk upload, view the roster, and reset passwords.',
      icon: UserPlus,
      href: '/warden/manage-students',
      color: 'from-violet-500 to-fuchsia-500',
      textColor: 'text-violet-400',
      allowed: ['WARDEN'],
    },
    {
      title: 'Leaderboard',
      description: 'Check how your wing ranks in the Clean Plate Score charts and view top sustainability champions.',
      icon: Trophy,
      href: '/leaderboard',
      color: 'from-amber-glow to-terracotta',
      textColor: 'text-amber-glow',
      allowed: ['STUDENT', 'WARDEN'],
    },
  ];

  const wingAvg = wingStats?.avgScore || 0;
  const isFeastUnlocked = wingAvg >= 90;
  const personalBadge = getBadgeIconAndColor(cleanPlateScore);
  const PersonalIcon = personalBadge.icon;

  return (
    <div className="min-h-screen bg-charcoal-dark text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          <section className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 rounded-2xl border border-slate-border bg-slate-card/30 p-6 flex flex-col justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-3xl">
                  Welcome back, {name.split(' ')[0]}!
                </h1>
                <p className="mt-2 text-slate-400 text-sm sm:text-base">
                  {role === 'WARDEN' 
                    ? `As Warden of ${wing}, you currate next week's menu and monitor your wing's Sunday Feast qualification status.`
                    : `Team up with your wing-mates to keep leftovers low! Help ${wing} achieve a group average score of 90+ to unlock Sunday Premium feasts.`
                  }
                </p>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-card/80 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-inset ring-slate-800">
                  <UserIcon className="h-3 w-3 text-emerald-primary" />
                  {role} Account
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-card/80 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-inset ring-slate-800">
                  Wing: {wing}
                </span>
                {role === 'WARDEN' && (
                  <button
                    type="button"
                    onClick={handleDownloadWeeklyReport}
                    disabled={reportLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-primary hover:bg-emerald-primary/90 disabled:opacity-50 px-4 py-2 text-xs font-black text-slate-950 uppercase tracking-wide transition-all active:scale-[0.98] shadow-lg shadow-emerald-primary/20"
                  >
                    {reportLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {reportLoading ? 'Generating…' : 'Download Weekly Report'}
                  </button>
                )}
              </div>
            </div>

            {role === 'STUDENT' ? (
              <div className="rounded-2xl border border-slate-border bg-slate-card/30 p-6 flex flex-col justify-between space-y-4">
                {wingLoading ? (
                  <div className="flex flex-1 items-center justify-center py-6">
                    <RefreshCw className="h-6 w-6 animate-spin text-emerald-primary" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Wing Standings
                        </span>
                        <strong className="text-2xl font-black text-white">{wingAvg}/100</strong>
                      </div>

                      <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${getProgressBarColor(wingAvg)}`}
                          style={{ width: `${wingAvg}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between items-center pt-1">
                        <span className="text-xs font-semibold text-slate-300">{wing} Average</span>
                        {isFeastUnlocked ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-primary/10 border border-emerald-primary/20 px-2 py-0.5 text-[8px] font-black text-emerald-primary uppercase tracking-wider">
                            <Sparkles className="h-2 w-2" /> Feast Unlocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-terracotta/10 border border-terracotta/20 px-2 py-0.5 text-[8px] font-black text-terracotta uppercase tracking-wider">
                            <Lock className="h-2 w-2" /> Locked (Need {90 - wingAvg} pts)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-800/80 pt-3 flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-500 uppercase font-semibold">My Personal Score</span>
                        <span className="text-sm font-extrabold text-white mt-0.5">{cleanPlateScore} pts</span>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black border uppercase tracking-wider ${personalBadge.color}`}>
                        <PersonalIcon className="h-2.5 w-2.5" />
                        {personalBadge.label}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-border bg-slate-card/30 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-semibold uppercase tracking-wider text-emerald-primary">
                      Admin Overview
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-primary ring-1 ring-inset ring-emerald-primary/20">
                      Live
                    </span>
                  </div>
                  
                  {statsLoading ? (
                    <div className="flex flex-1 items-center justify-center py-6">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-primary border-t-transparent"></div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="rounded-lg bg-charcoal-dark p-3 border border-slate-border/40">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Students</span>
                        <span className="text-lg font-bold text-white flex items-center gap-1 mt-0.5">
                          <Users className="h-4 w-4 text-emerald-primary" />
                          {stats?.totalStudents || 0}
                        </span>
                      </div>
                      <div className="rounded-lg bg-charcoal-dark p-3 border border-slate-800/40">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Active Votes</span>
                        <span className="text-lg font-bold text-white flex items-center gap-1 mt-0.5">
                          <CalendarDays className="h-4 w-4 text-emerald-primary" />
                          {stats?.totalVotes || 0}
                        </span>
                      </div>
                      <div className="rounded-lg bg-charcoal-dark p-3 border border-slate-800/40">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Waste Logs</span>
                        <span className="text-lg font-bold text-white flex items-center gap-1 mt-0.5">
                          <UtensilsCrossed className="h-4 w-4 text-emerald-primary" />
                          {stats?.totalLogs || 0}
                        </span>
                      </div>
                      <div className="rounded-lg bg-charcoal-dark p-3 border border-slate-800/40">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Hostel Avg Score</span>
                        <span className="text-lg font-bold text-emerald-primary flex items-center gap-1 mt-0.5">
                          <Award className="h-4 w-4" />
                          {stats?.avgScore || 100}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-4 text-[10px] text-slate-500 leading-relaxed">
                  Live metrics aggregated from active mess logs.
                </p>
              </div>
            )}
          </section>

          {role === 'WARDEN' && (
            <section className="rounded-2xl border border-emerald-primary/25 bg-gradient-to-r from-emerald-primary/10 via-slate-card/40 to-slate-card/20 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-primary/15 p-3 ring-1 ring-emerald-primary/25 text-emerald-primary shrink-0">
                  <FileDown className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Weekly PDF Report</h2>
                  <p className="mt-1 text-sm text-slate-400 max-w-xl">
                    Export a professional summary with wing leaderboard, top &amp; bottom dishes,
                    waste trends, and Prophet forecast for the current simulation week.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadWeeklyReport}
                disabled={reportLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-primary hover:bg-emerald-primary/90 disabled:opacity-50 px-6 py-3 text-sm font-black text-slate-950 transition-all active:scale-[0.98] shadow-lg shadow-emerald-primary/25 shrink-0"
              >
                {reportLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating PDF…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download Weekly Report
                  </>
                )}
              </button>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white">Quick Actions</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cards
                .filter((card) => card.allowed.includes(role))
                .map((card) => {
                  const IconComponent = card.icon;
                  return (
                    <div 
                      key={card.title}
                      onClick={() => router.push(card.href)}
                      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-border bg-slate-card/30 p-6 transition-all hover:-translate-y-1 hover:border-slate-755 hover:bg-slate-card/65"
                    >
                      <div className={`absolute -right-16 -top-16 h-32 w-32 rounded-full bg-gradient-to-br ${card.color} opacity-0 blur-2xl transition-opacity group-hover:opacity-10`}></div>
                      
                      <div className="flex items-start justify-between">
                        <div className={`rounded-xl bg-charcoal-dark p-3 ring-1 ring-slate-800 ${card.textColor}`}>
                          <IconComponent className="h-6 w-6" />
                        </div>
                      </div>
                      <h3 className="mt-4 text-lg font-bold text-white group-hover:text-emerald-primary transition-colors">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                  );
                })}
            </div>
          </section>
        </main>
      </div>

      <Footer />
    </div>
  );
}
