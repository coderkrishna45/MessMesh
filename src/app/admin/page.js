'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { toast } from 'react-hot-toast';
import { generateWeeklyReportPDF } from '@/lib/generateWeeklyReport';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  CalendarDays, 
  UtensilsCrossed, 
  Sparkles, 
  ShieldAlert, 
  CheckCircle,
  RefreshCw,
  Zap,
  BarChart2,
  CalendarRange,
  ArrowRight,
  XCircle,
  FileCheck,
  Download
} from 'lucide-react';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState(null);
  const [wingWaste, setWingWaste] = useState([]);
  const [dailyHistory, setDailyHistory] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [wingScores, setWingScores] = useState([]);
  const [dayOfWeekName, setDayOfWeekName] = useState('');
  const [reportPayload, setReportPayload] = useState(null);

  const [loadingData, setLoadingData] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [generatingMenu, setGeneratingMenu] = useState(false);
  const [publishingMenu, setPublishingMenu] = useState(false);
  const [menuSuccessMessage, setMenuSuccessMessage] = useState('');
  const [error, setError] = useState('');

  const [draftMenu, setDraftMenu] = useState(null);
  const [draftWeekStart, setDraftWeekStart] = useState('');
  const [unlockingFeast, setUnlockingFeast] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState('');
  const [unlockError, setUnlockError] = useState('');
  // false = enforce real Saturday; true = demo unlock without waiting for Saturday
  const [simulateSunday, setSimulateSunday] = useState(false);

  // Defer chart render until client mount (Recharts SSR)
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      if (!['ADMIN', 'WARDEN'].includes(session.user.role)) {
        router.push('/dashboard');
      } else {
        fetchAdminStats();
      }
    }
  }, [status, session, router]);

  const fetchAdminStats = async () => {
    try {
      setLoadingData(true);
      setError('');
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setWingWaste(data.wingWaste);
        setDailyHistory(data.dailyHistory);
        setForecast(data.forecast);
        setWingScores(data.wingScores || []);
        setDayOfWeekName(data.dayOfWeekName || '');
        setReportPayload(data);
      } else {
        setError(data.error || 'Failed to fetch admin statistics.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while loading dashboard metrics.');
    } finally {
      setLoadingData(false);
    }
  };

  const handleDownloadWeeklyReport = async () => {
    setReportLoading(true);
    try {
      let data = reportPayload;
      if (!data) {
        const res = await fetch('/api/admin/stats');
        data = await res.json();
        if (!data.success) {
          toast.error(data.error || 'Failed to load report data.');
          return;
        }
        setReportPayload(data);
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

  const handlePreviewMenu = async () => {
    setGeneratingMenu(true);
    setMenuSuccessMessage('');
    setError('');
    setDraftMenu(null);
    try {
      const res = await fetch('/api/admin/generate-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      });
      const data = await res.json();
      if (data.success) {
        setDraftMenu(data.draftMenu);
        setDraftWeekStart(data.weekStartDate);
      } else {
        setError(data.error || 'Draft menu generation failed.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during menu generation.');
    } finally {
      setGeneratingMenu(false);
    }
  };

  const handlePublishMenu = async () => {
    setPublishingMenu(true);
    setMenuSuccessMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/generate-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });
      const data = await res.json();
      if (data.success) {
        setMenuSuccessMessage(
          `Success! The weekly menu starting ${data.weekStartDate} has been published for student view. The previous voting cycle has been archived and a new poll initialized!`
        );
        setDraftMenu(null);
        fetchAdminStats();
      } else {
        setError(data.error || 'Publishing menu failed.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during menu publication.');
    } finally {
      setPublishingMenu(false);
    }
  };

  const handleCancelDraft = () => {
    setDraftMenu(null);
    setDraftWeekStart('');
    setMenuSuccessMessage('');
  };

  const handleUnlockFeast = async () => {
    setUnlockingFeast(true);
    setUnlockSuccess('');
    setUnlockError('');
    try {
      const res = await fetch('/api/admin/unlock-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulateSunday }),
      });
      const data = await res.json();
      if (data.success) {
        setUnlockSuccess(data.message);
        fetchAdminStats();
      } else {
        setUnlockError(data.error || 'Unlocking Premium Feast failed.');
      }
    } catch (err) {
      console.error(err);
      setUnlockError('An error occurred during unlock request.');
    } finally {
      setUnlockingFeast(false);
    }
  };

  if (status === 'loading' || !mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal-dark text-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!session || !['ADMIN', 'WARDEN'].includes(session.user.role)) return null;

  const getRiskColor = (level) => {
    switch (level) {
      case 'HIGH': return 'text-terracotta bg-terracotta/10 border-terracotta/20';
      case 'LOW': return 'text-emerald-primary bg-emerald-primary/10 border-emerald-primary/20';
      default: return 'text-amber-glow bg-amber-glow/10 border-amber-glow/20';
    }
  };

  const getRiskBorder = (level) => {
    switch (level) {
      case 'HIGH': return 'border-terracotta/40';
      case 'LOW': return 'border-emerald-primary/45';
      default: return 'border-amber-glow/40';
    }
  };

  const weekdaysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const getDraftMealForDay = (day, mealType) => {
    if (!draftMenu) return '-';
    const match = draftMenu.find((m) => m.dayOfWeek === day && m.mealType === mealType);
    return match ? match.dish.name : '-';
  };

  // Feast unlock: wing avg ≥ 90 and (real Saturday or simulate mode)
  const wardenWing = session.user.wing;
  const wardenWingScoreObj = wingScores.find((w) => w.wing === wardenWing);
  const wardenWingScore = wardenWingScoreObj ? wardenWingScoreObj.avgScore : 0;
  const isWardenWingEligible = wardenWingScore >= 90;
  const isSaturday = dayOfWeekName === 'Saturday';

  return (
    <div className="min-h-screen bg-charcoal-dark text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
                <ShieldAlert className="h-8 w-8 text-emerald-primary" />
                Mess Curation & Analytics
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Monitor plate waste index metrics, audit weekly student voting patterns, and generate optimized meal schedules.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadWeeklyReport}
                disabled={reportLoading || loadingData}
                className="rounded-xl bg-emerald-primary hover:bg-emerald-primary/90 disabled:opacity-50 px-4 py-2 text-xs font-black text-slate-950 uppercase tracking-wide transition-all active:scale-[0.98] flex items-center gap-1.5 shadow-lg shadow-emerald-primary/20"
              >
                {reportLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {reportLoading ? 'Generating…' : 'Download Weekly Report'}
              </button>
              <button
                onClick={fetchAdminStats}
                disabled={loadingData}
                className="rounded-lg border border-slate-border bg-slate-card/50 hover:bg-slate-card p-2 text-slate-400 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {loadingData ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-primary" />
              <span className="text-xs text-slate-400">Loading mess audit data...</span>
            </div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-border bg-slate-card/45 p-6 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Registered Students</span>
                  <span className="text-2xl font-black text-white flex items-center gap-2 pt-1">
                    <Users className="h-6 w-6 text-emerald-primary" />
                    {stats?.totalStudents || 0}
                  </span>
                </div>
                
                <div className="rounded-2xl border border-slate-border bg-slate-card/45 p-6 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Active Poll Votes</span>
                  <span className="text-2xl font-black text-white flex items-center gap-2 pt-1">
                    <CalendarDays className="h-6 w-6 text-emerald-primary" />
                    {stats?.totalVotes || 0}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-border bg-slate-card/45 p-6 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Plate Audits Logged</span>
                  <span className="text-2xl font-black text-white flex items-center gap-2 pt-1">
                    <UtensilsCrossed className="h-6 w-6 text-emerald-primary" />
                    {stats?.totalLogs || 0}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-border bg-slate-card/45 p-6 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">{session.user.role === 'WARDEN' ? 'Wing Clean Plate Score' : 'Hostel Clean Plate Score'}</span>
                  <span className="text-2xl font-black text-emerald-primary flex items-center gap-2 pt-1">
                    <Sparkles className="h-6 w-6 animate-pulse text-amber-glow" />
                    {stats?.avgScore ?? 0}/100
                  </span>
                </div>
              </div>

              {forecast && (
                <div className={`rounded-2xl border p-6 space-y-4 bg-slate-card/45 ${getRiskBorder(forecast.riskLevel)}`}>
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Zap className="h-5 w-5 text-terracotta" />
                      Prophet JS: {"Tomorrow's"} Waste Level Forecaster
                    </h3>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border rounded-full ${getRiskColor(forecast.riskLevel)}`}>
                      Risk Level: {forecast.riskLevel}
                    </span>
                  </div>

                  <div className="grid gap-6 md:grid-cols-3 items-center">
                    <div className="bg-charcoal-dark/50 border border-slate-border/50 rounded-xl p-4 text-center">
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">Predicted Waste Index</span>
                      <strong className="text-4xl font-black text-white block mt-1">
                        {forecast.tomorrowForecast}
                      </strong>
                      <span className="text-[10px] text-slate-500 block mt-1">
                        On 1 to 5 scale (Confidence {forecast.confidenceInterval})
                      </span>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <h4 className="text-sm font-semibold text-slate-200">Serving Portion Recommendations:</h4>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {forecast.recommendation}
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        This forecast utilizes a weighted moving average algorithm over the previous 7 days of leftovers.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {session.user.role === 'WARDEN' && <div className="rounded-2xl border border-slate-border bg-slate-card/25 p-6 space-y-6">
                <div className="flex justify-between items-start flex-wrap gap-4 border-b border-slate-border/50 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Sparkles className="h-5.5 w-5.5 text-amber-glow" />
                      Sunday Premium Feast Wing Eligibility
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Cooperative Target: Wings with an average Clean Plate Score of 90+ qualify for the Premium Sunday Feast.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {process.env.NEXT_PUBLIC_ENABLE_DATE_SIMULATION === 'true' && <div className="flex items-center gap-2 rounded bg-charcoal-dark px-3 py-1.5 border border-slate-800 text-xs">
                      <input
                        type="checkbox"
                        id="simSunday"
                        checked={simulateSunday}
                        onChange={(e) => setSimulateSunday(e.target.checked)}
                        className="rounded border-slate-850 bg-slate-900 text-emerald-primary focus:ring-emerald-primary cursor-pointer h-3.5 w-3.5"
                      />
                      <label htmlFor="simSunday" className="text-[10px] text-slate-500 font-semibold cursor-pointer uppercase tracking-wider select-none">
                        Simulate Saturday Mode
                      </label>
                    </div>}

                    <button
                      onClick={handleUnlockFeast}
                      disabled={unlockingFeast || !isWardenWingEligible || (!isSaturday && !simulateSunday)}
                      className="rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 px-5 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed select-none"
                    >
                      {unlockingFeast ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-950" />
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Unlock {"Tomorrow's"} Sunday Feast ({wardenWing})
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {unlockSuccess && (
                  <div className="rounded-xl border border-emerald-primary/20 bg-emerald-primary/10 p-3 text-xs text-emerald-primary">
                    {unlockSuccess}
                  </div>
                )}
                {unlockError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                    {unlockError}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {wingScores.map((w) => {
                    const isWardenWing = w.wing === wardenWing;
                    const unlocked = w.avgScore >= 90;
                    return (
                      <div
                        key={w.wing}
                        className={`rounded-xl border p-4 flex flex-col justify-between space-y-3 bg-charcoal-dark/50 ${
                          isWardenWing
                            ? 'border-emerald-primary bg-emerald-primary/[0.01] ring-1 ring-emerald-primary/20'
                            : unlocked 
                              ? 'border-emerald-primary/25' 
                              : 'border-slate-800'
                        }`}
                      >
                        <div>
                          <span className="font-extrabold text-sm text-white flex items-center gap-1.5">
                            {w.wing}
                            {isWardenWing && (
                              <span className="rounded bg-emerald-primary/10 border border-emerald-primary/20 px-1 py-0.5 text-[8px] font-black text-emerald-primary uppercase tracking-wider">
                                Yours
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">Average Score</span>
                          <strong className="text-xl font-black text-white block mt-1">{w.avgScore} / 100</strong>
                        </div>
                        
                        <div>
                          {unlocked ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-primary/10 border border-emerald-primary/20 px-2 py-0.5 text-[9px] font-black text-emerald-primary uppercase tracking-wider">
                              🎉 FEAST UNLOCKED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-terracotta/10 border border-terracotta/20 px-2 py-0.5 text-[9px] font-black text-terracotta uppercase tracking-wider">
                              🔒 LOCKED (Need {90 - w.avgScore} pts)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}

              <div className="grid gap-8 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-border bg-slate-card/25 p-6 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    <TrendingUp className="h-5 w-5 text-emerald-primary" />
                    Daily Leftovers History
                  </h3>
                  
                  <div className="h-72 w-full text-xs">
                    {dailyHistory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#282a2d" />
                          <XAxis dataKey="dayLabel" stroke="#94a3b8" />
                          <YAxis domain={[1, 5]} stroke="#94a3b8" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#16181b', borderColor: '#282a2d', borderRadius: '12px' }}
                            labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="avgWaste" 
                            stroke="#10b981" 
                            strokeWidth={3} 
                            activeDot={{ r: 8 }} 
                            name="Avg Waste Level"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-500 italic">
                        No daily history logged yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-border bg-slate-card/25 p-6 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    <BarChart2 className="h-5 w-5 text-emerald-primary" />
                    Wing Leftover Index Averages
                  </h3>

                  <div className="h-72 w-full text-xs">
                    {wingWaste.some(w => w.avgWaste > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={wingWaste}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#282a2d" />
                          <XAxis dataKey="wing" stroke="#94a3b8" />
                          <YAxis domain={[0, 5]} stroke="#94a3b8" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#16181b', borderColor: '#282a2d', borderRadius: '12px' }}
                            labelStyle={{ color: '#fff', fontWidth: 'bold' }}
                          />
                          <Bar 
                            dataKey="avgWaste" 
                            fill="#f97316" 
                            radius={[6, 6, 0, 0]}
                            name="Avg Waste Index"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-500 italic">
                        No wing data generated yet.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="rounded-2xl border border-slate-border bg-slate-card/45 p-6 space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <CalendarRange className="h-6 w-6 text-terracotta" />
                    Compile Next {"Week's"} Menu
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Compile student preferred dishes ranked by highest taste ratings. Administrators may publish the shared hostel menu.
                  </p>
                </div>

                {menuSuccessMessage && (
                  <div className="rounded-xl border border-emerald-primary/20 bg-emerald-primary/10 p-4 text-sm text-emerald-primary flex items-start gap-2.5">
                    <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{menuSuccessMessage}</span>
                  </div>
                )}

                {!draftMenu && (
                  <button
                    onClick={handlePreviewMenu}
                    disabled={generatingMenu}
                    className="w-full rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 py-3.5 font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 text-xs"
                  >
                    {generatingMenu ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                        Analyzing Taste Votes & Curating Draft...
                      </>
                    ) : (
                      'Generate & Preview Next Week\'s Menu'
                    )}
                  </button>
                )}
              </div>

              {draftMenu && (
                <div className="rounded-2xl border border-emerald-primary/20 bg-slate-card/45 p-6 space-y-6">
                  <div className="flex justify-between items-center flex-wrap gap-3 border-b border-slate-border pb-4">
                    <div>
                      <h4 className="font-bold text-white flex items-center gap-1.5 text-sm sm:text-base">
                        <FileCheck className="h-5 w-5 text-emerald-primary" />
                        Preview Generated Menu (Roster: {draftWeekStart})
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Review this rotation. Administrators can publish it for the hostel.
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelDraft}
                        disabled={publishingMenu}
                        className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </button>
                      
                      {session.user.role === 'ADMIN' && <button
                        onClick={handlePublishMenu}
                        disabled={publishingMenu}
                        className="rounded-lg bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 px-4 py-2 text-xs font-bold transition-all flex items-center gap-1 active:scale-[0.98]"
                      >
                        {publishingMenu ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Publishing...
                          </>
                        ) : (
                          <>
                            Approve & Publish <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>}
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-border rounded-xl bg-slate-card/10">
                    <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                      <thead>
                        <tr className="border-b border-slate-border bg-charcoal-dark/50 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          <th className="py-3 px-4 border-r border-slate-border/50 bg-charcoal-dark w-28">Meal Slot</th>
                          {weekdaysList.map((day) => (
                            <th key={day} className="py-3 px-4 text-center font-bold">{day}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-border/40">
                        {['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'].map((mealSlot) => (
                          <tr key={mealSlot} className="hover:bg-slate-card/5">
                            <td className="py-3 px-4 border-r border-slate-border/50 bg-charcoal-dark/25 font-bold uppercase text-slate-400 tracking-wider">
                              {mealSlot.toLowerCase()}
                            </td>
                            {weekdaysList.map((day) => (
                              <td key={day} className="py-3 px-4 border-r border-slate-border/20 last:border-r-0 text-center">
                                <span className="font-bold text-white leading-relaxed block max-w-[90px] mx-auto truncate" title={getDraftMealForDay(day, mealSlot)}>
                                  {getDraftMealForDay(day, mealSlot)}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}
