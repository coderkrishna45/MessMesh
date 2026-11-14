'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { 
  Clock, 
  Calendar,
  Info,
  Star,
  RefreshCw,
  UtensilsCrossed,
  ShieldAlert,
  ArrowRight,
  History,
  Sparkles
} from 'lucide-react';

export default function VotePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Date follows the global simulation clock (not browser today)
  const [selectedDate, setSelectedDate] = useState('');
  const [dayOfWeekName, setDayOfWeekName] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ratingFor, setRatingFor] = useState(null);
  const socketRef = useRef(null);
  const [hoveredStars, setHoveredStars] = useState({});
  // historyOffset: 0 = current week, 1 = last week, 2 = two weeks ago
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [wardenWingScore, setWardenWingScore] = useState(0);
  const [unlockingFeast, setUnlockingFeast] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState('');
  const [unlockError, setUnlockError] = useState('');

  const isWarden = session?.user?.role === 'WARDEN';

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/admin/simulate-date')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setSelectedDate(data.date);
          }
        })
        .catch((err) => console.error('Error fetching global simulated date:', err));
    }
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated' && selectedDate) {
      fetchMenu(selectedDate);
    }
  }, [status, selectedDate]);

  const fetchMenu = async (dateStr) => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`/api/vote?date=${dateStr}`);
      const data = await res.json();
      if (data.success) {
        setMenuItems(data.menu);
        setDayOfWeekName(data.dayOfWeek);
      } else {
        setError(data.error || 'Failed to load menu ratings.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while loading the menu.');
    } finally {
      setLoading(false);
    }
  };

  // Live ratings, sim-date changes, and feast unlocks over Socket.io
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('rate-updated', (data) => {
      setMenuItems((prevMenu) => {
        return prevMenu.map((item) => {
          if (item.dish._id === data.dishId) {
            return {
              ...item,
              avgRating: data.avgRating,
              totalRatings: data.totalRatings,
            };
          }
          return item;
        });
      });
      if (status === 'authenticated' && !isWarden) {
        fetchHistory(historyOffset);
      }
    });

    socket.on('date-simulated', (data) => {
      setSelectedDate(data.date);
    });

    // Reload menu when this wing unlocks Premium Sunday Feast
    socket.on('feast-unlocked', (data) => {
      if (status === 'authenticated' && session?.user?.wing === data.wing) {
        fetchMenu(selectedDate);
      }
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [historyOffset, isWarden, status, selectedDate, session]);

  useEffect(() => {
    if (status === 'authenticated' && !isWarden) {
      fetchHistory(historyOffset);
    }
  }, [status, historyOffset, isWarden, selectedDate]);

  useEffect(() => {
    if (status === 'authenticated' && isWarden) {
      fetch('/api/leaderboard')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            const match = data.wingLeaderboard.find((w) => w.wing === session.user.wing);
            setWardenWingScore(match ? match.avgScore : 0);
          }
        })
        .catch((err) => console.error('Error fetching leaderboard wing score:', err));
    }
  }, [status, isWarden, session]);

  const fetchHistory = async (offset) => {
    try {
      setLoadingHistory(true);
      const res = await fetch(`/api/vote/history?weekOffset=${offset}`);
      const data = await res.json();
      if (data.success) {
        setHistoryData(data.history);
      }
    } catch (err) {
      console.error('Error fetching rating history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRate = async (dishId, ratingValue) => {
    setRatingFor(dishId);
    setError('');

    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dishId,
          rating: ratingValue,
          date: selectedDate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMenuItems((prevMenu) => {
          return prevMenu.map((item) => {
            if (item.dish._id === dishId || item.dish._id?.toString() === dishId) {
              return {
                ...item,
                userRating: data.userRating,
                avgRating: data.avgRating,
                totalRatings: data.totalRatings,
              };
            }
            return item;
          });
        });
        // Refresh history matrix so stars appear immediately
        if (!isWarden) {
          fetchHistory(historyOffset);
        }
      } else {
        setError(data.error || 'Failed to submit taste rating.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while saving your review.');
    } finally {
      setRatingFor(null);
    }
  };

  // Warden feast unlock (score ≥ 90); simulateSunday for demo without waiting for Saturday
  const handleUnlockFeast = async () => {
    setUnlockingFeast(true);
    setUnlockSuccess('');
    setUnlockError('');
    try {
      const res = await fetch('/api/admin/unlock-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, simulateSunday: true }),
      });
      const data = await res.json();
      if (data.success) {
        setUnlockSuccess(data.message);
        fetchMenu(selectedDate);
      } else {
        setUnlockError(data.error || 'Failed to unlock Sunday Premium Feast.');
      }
    } catch (err) {
      console.error(err);
      setUnlockError('An error occurred during Sunday Feast unlock request.');
    } finally {
      setUnlockingFeast(false);
    }
  };

  const handleStarHover = (dishId, value) => {
    setHoveredStars((prev) => ({ ...prev, [dishId]: value }));
  };

  const handleStarLeave = (dishId) => {
    setHoveredStars((prev) => ({ ...prev, [dishId]: 0 }));
  };

  const weekdaysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const mealTypesList = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];

  const getMatrixCell = (day, mealType) => {
    const item = historyData.find(h => h.dayOfWeek === day && h.mealType === mealType);
    if (!item) return <span className="text-slate-750">-</span>;

    return (
      <div className="flex flex-col justify-between py-1 min-h-[48px]">
        <span className="text-[10px] text-slate-350 font-bold block truncate max-w-[85px] leading-tight" title={item.dishName}>
          {item.dishName}
        </span>
        <div className="mt-1.5 flex items-center justify-center gap-0.5">
          {item.rating > 0 ? (
            <>
              <Star className="h-3 w-3 fill-amber-glow text-amber-glow" />
              <span className="text-[10px] font-black text-white">{item.rating}</span>
            </>
          ) : (
            <span className="text-[9px] text-slate-650 italic">Unrated</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-charcoal-dark text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-border/60 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white">
                {isWarden ? "Daily Meal Ratings Monitor" : "Rate Today's Meals"}
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                {isWarden 
                  ? `Real-time taste rating logs and audit summaries submitted by hostel students for ${dayOfWeekName}.`
                  : `Provide feedback on the taste of the dishes served on ${dayOfWeekName}. Rate multiple dishes as you eat!`
                }
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-border bg-slate-card/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-glow/10 text-amber-glow ring-1 ring-amber-glow/25">
              <Star className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-white">Taste ratings stay forever</h4>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Dish star ratings accumulate over time and never weekly-reset.
                Your <span className="text-emerald-primary font-semibold">Clean Plate Score</span> starts
                at <strong className="text-white">0 every Monday</strong> and builds with clean plates
                through Saturday (Sunday feast if wing avg ≥ 90). Past weeks on the{' '}
                <button
                  type="button"
                  onClick={() => router.push('/leaderboard')}
                  className="text-emerald-primary underline underline-offset-2 font-semibold"
                >
                  Leaderboard
                </button>
                .
              </p>
            </div>
          </div>

          {isWarden && (
            <div className="rounded-2xl border border-emerald-primary/20 bg-slate-card/65 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-6 w-6 text-emerald-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white text-sm">Warden Administrative View</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    As Warden, you can view overall ratings and analytics. Go to the Admin Dashboard for menu management and reports.
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/admin')}
                className="rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1 shrink-0 active:scale-[0.98]"
              >
                Go to Admin Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {isWarden && dayOfWeekName === 'Saturday' && (
            <div className="rounded-2xl border border-amber-glow/20 bg-slate-card/45 p-6 space-y-4">
              <div className="flex justify-between items-start flex-wrap gap-4 border-b border-slate-border/50 pb-4">
                <div>
                  <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Sparkles className="h-4.5 w-4.5 text-amber-glow" />
                    Sunday Premium Feast Swap Curation ({session.user.wing})
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Swap tomorrow&apos;s regular Sunday meals with Premium Sunday Feast dishes if your wing&apos;s average score is 90+.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded bg-charcoal-dark px-2.5 py-1.5 border border-slate-800 text-[10px] text-slate-350 font-bold uppercase tracking-wider">
                    Score: {wardenWingScore}/100
                  </div>

                  <button
                    onClick={handleUnlockFeast}
                    disabled={unlockingFeast || wardenWingScore < 90}
                    className="rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed select-none"
                  >
                    {unlockingFeast ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-950" />
                    ) : (
                      "Unlock Tomorrow's Sunday Feast"
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
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-emerald-primary" />
              Today&apos;s Scheduled Roster ({dayOfWeekName})
            </h2>
            
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-8 w-8 animate-spin text-emerald-primary" />
                <span className="text-xs text-slate-400">Fetching today&apos;s schedule...</span>
              </div>
            ) : menuItems.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {menuItems.map((item) => {
                  const dish = item.dish;
                  const isVeg = dish.isVeg;
                  const activeHover = hoveredStars[dish._id] || 0;
                  const currentRating = item.userRating || 0;

                  return (
                    <div 
                      key={item.mealType}
                      className="rounded-2xl border border-slate-border bg-slate-card/30 p-5 flex gap-4 hover:border-slate-800 transition-all relative overflow-hidden"
                    >
                      <div className="h-24 w-24 rounded-xl overflow-hidden shrink-0 border border-slate-800 bg-slate-900/50">
                        {dish.image ? (
                          <img 
                            src={dish.image} 
                            alt={dish.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase">
                            Dish Image
                          </div>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                              {item.mealType}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider border ${
                              isVeg 
                                ? 'bg-emerald-primary/10 border-emerald-primary/20 text-emerald-primary' 
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                              {isVeg ? 'Veg' : 'Non-Veg'}
                            </span>
                          </div>

                          <h3 className="text-base font-bold text-white mt-1 leading-snug">
                            {dish.name}
                            {item.isPremium && (
                              <span className="ml-2 rounded bg-amber-glow/10 border border-amber-glow/20 px-1 py-0.5 text-[8px] font-black text-amber-glow uppercase tracking-wider">
                                Premium Feast
                              </span>
                            )}
                          </h3>
                        </div>

                        {isWarden ? (
                          <div className="flex items-center gap-4 mt-2">
                            <div>
                              <span className="text-[9px] text-slate-500 block uppercase font-medium">Average Rating</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Star className="h-4.5 w-4.5 fill-amber-glow text-amber-glow" />
                                <span className="font-bold text-white text-sm">
                                  {item.avgRating || 'Unrated'}
                                </span>
                              </div>
                            </div>

                            <div className="border-l border-slate-800/80 pl-4">
                              <span className="text-[9px] text-slate-500 block uppercase font-medium">Logs Count</span>
                              <span className="font-bold text-slate-300 text-sm block mt-0.5">
                                {item.totalRatings} reviews
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => {
                                const fillStar = activeHover ? star <= activeHover : star <= currentRating;
                                return (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => handleRate(dish._id, star)}
                                    onMouseEnter={() => handleStarHover(dish._id, star)}
                                    onMouseLeave={() => handleStarLeave(dish._id)}
                                    disabled={ratingFor === dish._id}
                                    className="p-0.5 outline-none transition-transform active:scale-125"
                                  >
                                    <Star 
                                      className={`h-5 w-5 ${
                                        fillStar 
                                          ? 'fill-amber-glow text-amber-glow' 
                                          : 'text-slate-600 hover:text-slate-550'
                                      }`}
                                    />
                                  </button>
                                );
                              })}
                            </div>
                            
                            <span className="text-[10px] text-slate-500">
                              {ratingFor === dish._id 
                                ? 'Saving...' 
                                : currentRating > 0 
                                  ? `You rated ${currentRating}★` 
                                  : 'Rate taste'
                              }
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 border border-dashed border-slate-800 rounded-2xl bg-slate-card/10 text-center text-slate-500 italic text-xs">
                No dishes scheduled for this day.
              </div>
            )}
          </div>

          {!isWarden && (
            <section className="space-y-6 pt-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <History className="h-5 w-5 text-emerald-primary" />
                    My Meal Rating History Matrix
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Trace your logged taste ratings across the current and preceding weeks.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 border border-slate-800 bg-charcoal-dark p-1 rounded-xl shrink-0 self-start sm:self-auto">
                  {[
                    { label: 'This Week', val: 0 },
                    { label: '1 Wk Ago', val: 1 },
                    { label: '2 Wks Ago', val: 2 },
                    { label: '3 Wks Ago', val: 3 },
                  ].map((btn) => (
                    <button
                      key={btn.val}
                      onClick={() => setHistoryOffset(btn.val)}
                      className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                        historyOffset === btn.val
                          ? 'bg-emerald-primary text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingHistory ? (
                <div className="py-12 flex justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-emerald-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-border rounded-xl bg-slate-card/10">
                  <table className="w-full text-center border-collapse text-xs min-w-[700px]">
                    <thead>
                      <tr className="border-b border-slate-border bg-charcoal-dark/50 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4 text-left border-r border-slate-border/50 bg-charcoal-dark w-24">Meal Slot</th>
                        {weekdaysList.map((day) => (
                          <th key={day} className="py-3 px-4 font-bold">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-border/40">
                      {mealTypesList.map((mealSlot) => (
                        <tr key={mealSlot} className="hover:bg-slate-card/5">
                          <td className="py-3 px-4 text-left border-r border-slate-border/50 bg-charcoal-dark/25 font-bold uppercase text-slate-400 tracking-wider">
                            {mealSlot.toLowerCase()}
                          </td>
                          {weekdaysList.map((day) => (
                            <td key={day} className="py-3 px-4 border-r border-slate-border/20 last:border-r-0">
                              {getMatrixCell(day, mealSlot)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

        </main>
      </div>

      <Footer />
    </div>
  );
}
