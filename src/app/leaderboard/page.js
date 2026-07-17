'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { 
  Trophy, 
  Crown, 
  Award,
  Users,
  TrendingUp,
  RefreshCw,
  Zap,
  Target,
  Sparkles,
  Lock,
  Gift
} from 'lucide-react';

export default function LeaderboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [wingLeaderboard, setWingLeaderboard] = useState([]);
  const [studentLeaderboard, setStudentLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchLeaderboards();
    }
  }, [status]);

  const fetchLeaderboards = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (data.success) {
        setWingLeaderboard(data.wingLeaderboard);
        setStudentLeaderboard(data.studentLeaderboard);
      } else {
        setError(data.error || 'Failed to fetch leaderboard data.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while loading the standings.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal-dark text-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!session) return null;

  const topStudent = studentLeaderboard[0];
  const topWing = wingLeaderboard[0];

  const overallAvg = studentLeaderboard.length > 0
    ? Math.round(studentLeaderboard.reduce((acc, curr) => acc + curr.cleanPlateScore, 0) / studentLeaderboard.length)
    : 0;

  const getRankBadge = (rank) => {
    switch (rank) {
      case 1:
        return (
          <div className="h-6 w-6 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 text-xs font-black">
            <Crown className="h-3.5 w-3.5 fill-amber-500" />
          </div>
        );
      case 2:
        return (
          <div className="h-6 w-6 rounded-full bg-slate-300/10 border border-slate-300/30 flex items-center justify-center text-slate-300 text-xs font-black">
            2
          </div>
        );
      case 3:
        return (
          <div className="h-6 w-6 rounded-full bg-amber-700/10 border border-amber-700/30 flex items-center justify-center text-amber-700 text-xs font-black">
            3
          </div>
        );
      default:
        return (
          <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-xs font-bold">
            {rank}
          </div>
        );
    }
  };

  const getAchievementBadge = (score) => {
    if (score >= 90) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-primary/10 border border-emerald-primary/20 px-2 py-0.5 text-[9px] font-black text-emerald-primary uppercase tracking-wider">
          <Sparkles className="h-2.5 w-2.5" /> Eco Champion
        </span>
      );
    }
    if (score >= 75) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-glow/10 border border-amber-glow/20 px-2 py-0.5 text-[9px] font-black text-amber-glow uppercase tracking-wider">
          <Target className="h-2.5 w-2.5" /> Conserver
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/10 border border-terracotta/20 px-2 py-0.5 text-[9px] font-black text-terracotta uppercase tracking-wider">
        <Zap className="h-2.5 w-2.5" /> Waste Minimizer
      </span>
    );
  };

  const getProgressColor = (score) => {
    if (score >= 90) return 'bg-emerald-primary';
    if (score >= 75) return 'bg-amber-glow';
    return 'bg-terracotta';
  };

  return (
    <div className="min-h-screen bg-charcoal-dark text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
                <Trophy className="h-8 w-8 text-amber-500" />
                Wing & Student Standings
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Gamified rankings based on food conservation. Conserve food, score points, and lead your wing to the top!
              </p>
            </div>
            
            <button
              onClick={fetchLeaderboards}
              disabled={loading}
              className="rounded-lg border border-slate-border bg-slate-card/50 hover:bg-slate-card p-2 text-slate-400 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-amber-glow/20 bg-slate-card/30 p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-glow/10 border border-amber-glow/20 text-amber-glow flex items-center justify-center shrink-0">
              <Gift className="h-5.5 w-5.5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-white text-sm">Cooperative Target: Sunday Premium Feast</h4>
              <p className="text-xs text-slate-400 leading-normal">
                If a Wing achieves a group average Clean Plate Score of **90+** by Sunday, the kitchen serves a premium feast menu upgrade to that Wing. Team up to keep leftovers low!
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-primary" />
              <span className="text-xs text-slate-400">Loading standings...</span>
            </div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-border bg-slate-card/40 p-6 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
                    <Crown className="h-6 w-6 fill-amber-500" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Leading Wing</span>
                    <span className="text-lg font-black text-white">{topWing?.wing || 'N/A'}</span>
                    <span className="text-xs text-slate-400 block mt-0.5">{topWing?.avgScore || 0} Avg Score</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-border bg-slate-card/40 p-6 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-emerald-primary/10 border border-emerald-primary/20 text-emerald-primary flex items-center justify-center">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Top Student</span>
                    <span className="text-lg font-black text-white truncate max-w-[150px] block">{topStudent?.name || 'N/A'}</span>
                    <span className="text-xs text-emerald-primary block font-semibold mt-0.5">{topStudent?.cleanPlateScore || 0} Points</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-border bg-slate-card/40 p-6 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-slate-800 border border-slate-700/80 text-slate-400 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Hostel Average</span>
                    <span className="text-lg font-black text-white">{overallAvg}/100</span>
                    <span className="text-xs text-slate-400 block mt-0.5">Across {studentLeaderboard.length} Students</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                    <Users className="h-5 w-5 text-emerald-primary" />
                    Wing Standings
                  </h3>

                  <div className="space-y-4">
                    {wingLeaderboard.map((item, index) => {
                      const isFirst = index === 0;
                      const hasUnlockedFeast = item.avgScore >= 90;

                      return (
                        <div
                          key={item.wing}
                          className={`rounded-2xl border bg-slate-card/30 p-5 relative overflow-hidden flex flex-col justify-between min-h-[190px] ${
                            isFirst 
                              ? 'border-amber-500/35 bg-amber-500/[0.02]' 
                              : 'border-slate-border'
                          }`}
                        >
                          {isFirst && (
                            <div className="absolute right-0 top-0 bg-amber-500/10 text-amber-500 text-[10px] font-extrabold px-3 py-1 rounded-bl-xl border-l border-b border-amber-500/20 uppercase tracking-wider flex items-center gap-1">
                              <Crown className="h-3 w-3 fill-amber-500" /> Leading
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-xs text-slate-500 block uppercase font-semibold">Rank #{index + 1}</span>
                              <span className="text-lg font-black text-white mt-1 block">{item.wing}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-black text-white">{item.avgScore}</span>
                              <span className="text-[9px] text-slate-500 block uppercase font-medium">Avg Score</span>
                            </div>
                          </div>

                          <div className="mt-4 space-y-1.5">
                            <div className="h-2 w-full rounded-full bg-charcoal-dark border border-slate-800 overflow-hidden">
                              <div
                                  className={`h-full rounded-full transition-all duration-500 ${getProgressColor(item.avgScore)}`}
                                  style={{ width: `${item.avgScore}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>{item.studentCount} Active Students</span>
                              <span>{item.avgScore}% Conserved</span>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-center">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Sunday Feast:</span>
                            {hasUnlockedFeast ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-primary/10 border border-emerald-primary/20 px-2 py-0.5 text-[8px] font-black text-emerald-primary uppercase tracking-wider">
                                <Sparkles className="h-2 w-2" /> Unlocked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-terracotta/10 border border-terracotta/20 px-2 py-0.5 text-[8px] font-black text-terracotta uppercase tracking-wider">
                                <Lock className="h-2 w-2" /> Locked (Need {90 - item.avgScore} pts)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 lg:col-span-2">
                  <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    Individual Champions
                  </h3>

                  <div className="rounded-2xl border border-slate-border bg-slate-card/30 overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-border bg-charcoal-dark/50 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <th className="py-4 px-6 text-center w-16">Rank</th>
                            <th className="py-4 px-6">Student</th>
                            <th className="py-4 px-6">Wing</th>
                            <th className="py-4 px-6">Badge / Achievement</th>
                            <th className="py-4 px-6 text-right w-36">Clean Plate Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-border/50">
                          {studentLeaderboard.map((student, index) => {
                            const rank = index + 1;
                            const score = student.cleanPlateScore;
                            const isCurrentUser = session.user.email === student.email;

                            return (
                              <tr
                                key={student.id}
                                className={`hover:bg-slate-card/45 transition-colors ${
                                  isCurrentUser ? 'bg-emerald-primary/[0.02] border-y border-emerald-primary/20' : ''
                                }`}
                              >
                                <td className="py-4 px-6 text-center">
                                  <div className="flex justify-center">{getRankBadge(rank)}</div>
                                </td>

                                <td className="py-4 px-6">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-white flex items-center gap-1.5">
                                      {student.name}
                                      {isCurrentUser && (
                                        <span className="rounded bg-emerald-primary/10 border border-emerald-primary/20 px-1 py-0.5 text-[8px] font-black text-emerald-primary uppercase tracking-wider">
                                          You
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[11px] text-slate-500 mt-0.5">{student.email}</span>
                                  </div>
                                </td>

                                <td className="py-4 px-6">
                                  <span className="font-semibold text-slate-300">{student.wing}</span>
                                </td>

                                <td className="py-4 px-6">{getAchievementBadge(score)}</td>

                                <td className="py-4 px-6 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="h-1.5 w-12 rounded-full bg-charcoal-dark border border-slate-800 overflow-hidden hidden sm:block">
                                      <div
                                        className={`h-full ${getProgressColor(score)}`}
                                        style={{ width: `${score}%` }}
                                      ></div>
                                    </div>
                                    <span className="font-extrabold text-white text-base">{score}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>
            </>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}
