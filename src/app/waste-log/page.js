'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { 
  Camera, 
  Trash2, 
  CheckCircle,
  Sparkles,
  RefreshCw,
  Calendar,
  UtensilsCrossed,
  Info,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export default function WasteLogPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [dayOfWeekName, setDayOfWeekName] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [selectedDishId, setSelectedDishId] = useState('');
  const [wasteLevel, setWasteLevel] = useState(3);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [error, setError] = useState('');
  const [loadingMenu, setLoadingMenu] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchMenuForDate(selectedDate);
    }
  }, [status, selectedDate]);

  const fetchMenuForDate = async (dateStr) => {
    setLoadingMenu(true);
    setError('');
    try {
      const res = await fetch(`/api/menu?date=${dateStr}`);
      const data = await res.json();
      if (data.success) {
        setMenuItems(data.menu);
        setDayOfWeekName(data.dayOfWeek);
        if (data.menu.length > 0) {
          setSelectedDishId(data.menu[0].dish._id);
        } else {
          setSelectedDishId('');
        }
      } else {
        setError(data.error || 'Failed to fetch menu for this date.');
        setMenuItems([]);
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while fetching the menu.');
      setMenuItems([]);
    } finally {
      setLoadingMenu(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDishId) {
      setError('Please select a dish to log waste.');
      return;
    }

    setSubmitting(true);
    setError('');
    setUploading(true);

    try {
      let finalImageUrl = '';

      if (image) {
        const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
        const uploadPreset =
          process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'messmesh_waste';

        // Placeholder image when Cloudinary is unset or mock (local/dev)
        if (!cloudName || cloudName === 'mock-cloud-name') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          finalImageUrl =
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500';
        } else {
          const formData = new FormData();
          formData.append('file', image);
          formData.append('upload_preset', uploadPreset);

          const uploadRes = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            { method: 'POST', body: formData }
          );
          const uploadData = await uploadRes.json();
          if (!uploadData.secure_url) {
            throw new Error(
              uploadData.error?.message ||
                'Cloudinary upload failed. Check cloud name and unsigned upload preset.'
            );
          }
          finalImageUrl = uploadData.secure_url;
        }
      }

      setUploading(false);

      const response = await fetch('/api/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishId: selectedDishId,
          wasteLevel: wasteLevel,
          imageUrl: finalImageUrl,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to submit waste log.');
      } else {
        setSuccessData(data);
        // Keep JWT/session score in sync without full re-auth
        await update({
          ...session,
          user: {
            ...session.user,
            cleanPlateScore: data.newScore
          }
        });
      }
    } catch (err) {
      setError('An error occurred during submission.');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const getSliderEmoji = (level) => {
    switch (level) {
      case 1: return { emoji: '😋', label: 'Zero Waste (Clean Plate!)', points: '+10 pts', color: 'text-emerald-primary' };
      case 2: return { emoji: '🙂', label: 'Minimal Waste (Bones/Spices)', points: '+5 pts', color: 'text-emerald-primary/80' };
      case 3: return { emoji: '😐', label: 'Average Waste (Left sides)', points: '0 pts', color: 'text-slate-400' };
      case 4: return { emoji: '🙁', label: 'Moderate Waste (Left half main)', points: '-5 pts', color: 'text-terracotta/80' };
      case 5: return { emoji: '😣', label: 'Heavy Waste (Barely touched)', points: '-15 pts', color: 'text-terracotta' };
      default: return { emoji: '😐', label: 'Average', points: '0 pts', color: 'text-slate-400' };
    }
  };

  const sliderMeta = getSliderEmoji(parseInt(wasteLevel, 10));

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal-dark text-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!session) return null;

  const isWarden = session.user.role === 'WARDEN';

  return (
    <div className="min-h-screen bg-charcoal-dark text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 space-y-6">
          <div className="rounded-2xl border border-slate-border/80 bg-slate-card/25 p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-primary font-bold text-sm">
              <Calendar className="h-4 w-4" />
              <span>Meal Calendar Archive</span>
            </div>
            <p className="text-xs text-slate-400">
              Select a date to audit the food leftovers served in the mess on that day of the week.
            </p>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-2.5 px-3 pl-9 text-xs text-white outline-none focus:border-emerald-primary"
                />
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
              </div>
              
              <div className="rounded-xl bg-charcoal-dark px-4 py-2 border border-slate-800 text-xs flex items-center justify-center gap-1.5 min-w-[120px]">
                <span className="text-slate-500">Day:</span>
                <span className="font-extrabold text-emerald-primary">{dayOfWeekName || '...'}</span>
              </div>
            </div>
          </div>

          {successData ? (
            <div className="rounded-2xl border border-emerald-primary/30 bg-slate-card/60 p-8 text-center space-y-6 shadow-xl backdrop-blur-xl">
              <div className="flex justify-center">
                <div className="rounded-full bg-emerald-primary/10 p-3 text-emerald-primary border border-emerald-primary/20">
                  <CheckCircle className="h-16 w-16" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white">Log Recorded Successfully!</h2>
                <p className="text-sm text-slate-400">
                  Logged waste on <span className="font-semibold text-white">{dayOfWeekName} ({selectedDate})</span>.
                </p>
              </div>

              <div className="rounded-xl bg-charcoal-dark border border-slate-border/50 p-5 space-y-4">
                <div className="flex justify-between items-center text-sm border-b border-slate-border/40 pb-3">
                  <span className="text-slate-400">Audit Points Earned:</span>
                  <span className={`font-bold ${successData.pointsEarned >= 0 ? 'text-emerald-primary' : 'text-terracotta'}`}>
                    {successData.pointsEarned >= 0 ? `+${successData.pointsEarned}` : successData.pointsEarned} pts
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">New Clean Plate Score:</span>
                  <span className="text-xl font-black text-emerald-primary flex items-center gap-1">
                    <Sparkles className="h-5 w-5 animate-pulse text-amber-glow" />
                    {successData.newScore}/100
                  </span>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  onClick={() => {
                    setSuccessData(null);
                    if (menuItems.length > 0) setSelectedDishId(menuItems[0].dish._id);
                    setWasteLevel(3);
                    setImage(null);
                    setImagePreview('');
                  }}
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-900/60 py-3 font-semibold text-white hover:bg-slate-800 transition-all text-sm"
                >
                  Log Another Meal
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex-1 rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 py-3 font-bold transition-all text-sm"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-border bg-slate-card/40 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
              <div>
                <h1 className="text-2xl font-black text-white flex items-center gap-2">
                  <UtensilsCrossed className="h-6 w-6 text-terracotta" />
                  Log Daily Plate Waste
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Log food waste for meals served on this day. Clean plates boost your Wing&apos;s score!
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                  {error}
                </div>
              )}

              {isWarden ? (
                <div className="rounded-xl border border-emerald-primary/20 bg-charcoal-dark p-5 space-y-4 text-center">
                  <div className="flex justify-center">
                    <div className="rounded-full bg-emerald-primary/10 p-3 text-emerald-primary border border-emerald-primary/20">
                      <ShieldAlert className="h-10 w-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-white text-base">Warden Administrative View</h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                      Only students are permitted to log food waste. As a Warden, you can view summary reports, forecaster charts, and aggregate scores on the admin dashboard.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/admin')}
                    className="w-full rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 py-3 font-bold transition-all text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    View Waste Reports & Analytics
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                loadingMenu ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="h-8 w-8 animate-spin text-emerald-primary" />
                    <span className="text-xs text-slate-400">Loading scheduled menu items...</span>
                  </div>
                ) : menuItems.length > 0 ? (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300">
                        Select Meal Roster Item
                      </label>
                      <div className="grid gap-3 mt-2 grid-cols-1 sm:grid-cols-2">
                        {menuItems.map((item) => {
                          const isSelected = selectedDishId === item.dish._id;
                          return (
                            <div
                              key={item.dish._id}
                              onClick={() => setSelectedDishId(item.dish._id)}
                              className={`cursor-pointer rounded-xl border p-3 flex flex-col justify-between transition-all ${
                                isSelected 
                                  ? 'border-emerald-primary bg-emerald-primary/5 shadow-md shadow-emerald-primary/5' 
                                  : 'border-slate-800 bg-charcoal-dark hover:border-slate-700'
                              }`}
                            >
                              <div>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                                  {item.mealType}
                                </span>
                                <span className="font-bold text-sm text-white block mt-0.5">
                                  {item.dish.name}
                                </span>
                              </div>
                              <span className={`text-[10px] font-semibold mt-2 self-start rounded-full px-2 py-0.5 border ${
                                item.dish.isVeg 
                                  ? 'bg-emerald-primary/10 border-emerald-primary/20 text-emerald-primary' 
                                  : 'bg-red-500/10 border-red-500/20 text-red-400'
                              }`}>
                                {item.dish.isVeg ? 'Veg' : 'Non-Veg'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-semibold text-slate-300">
                          Audited Waste Level
                        </label>
                        <span className={`text-sm font-extrabold ${sliderMeta.color}`}>
                          {sliderMeta.points}
                        </span>
                      </div>

                      <div className="rounded-xl bg-charcoal-dark border border-slate-800/80 p-4 text-center space-y-2">
                        <span className="text-5xl block animate-bounce" role="img">
                          {sliderMeta.emoji}
                        </span>
                        <span className="text-sm font-bold text-white block">
                          {sliderMeta.label}
                        </span>
                      </div>

                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={wasteLevel}
                        onChange={(e) => setWasteLevel(parseInt(e.target.value, 10))}
                        className="w-full h-2 rounded-lg bg-charcoal-dark appearance-none cursor-pointer accent-emerald-primary border border-slate-800"
                      />
                      
                      <div className="flex justify-between text-xs text-slate-500 font-semibold px-1">
                        <span>😋 Clean</span>
                        <span>🙂 Low</span>
                        <span>😐 Med</span>
                        <span>🙁 High</span>
                        <span>😣 Heavy</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-300">
                        Meal Plate Image (Optional)
                      </label>

                      {imagePreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-slate-800 max-h-48 flex justify-center bg-charcoal-dark">
                          <img src={imagePreview} alt="Plate Audit Preview" className="object-cover max-h-48 w-full" />
                          <button
                            type="button"
                            onClick={() => { setImage(null); setImagePreview(''); }}
                            className="absolute right-3 top-3 rounded-lg bg-slate-950/80 p-2 text-red-400 hover:text-red-300 border border-slate-800 backdrop-blur-sm transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center rounded-xl border border-dashed border-slate-800 bg-charcoal-dark px-6 py-6 hover:border-slate-755 transition-all">
                          <div className="text-center space-y-2">
                            <Camera className="mx-auto h-8 w-8 text-slate-500" />
                            <div className="text-xs text-slate-400">
                              <label htmlFor="file-upload" className="relative cursor-pointer font-semibold text-emerald-primary hover:text-emerald-primary/80">
                                <span>Upload a picture</span>
                                <input id="file-upload" type="file" accept="image/*" onChange={handleImageChange} className="sr-only" />
                              </label>
                              <span> to verify plate cleanliness</span>
                            </div>
                            <p className="text-[10px] text-slate-500">PNG, JPG up to 10MB</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 py-3.5 font-bold text-slate-950 active:scale-[0.98] disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {uploading ? 'Uploading Photo...' : 'Submitting Audit...'}
                        </>
                      ) : (
                        'Submit Daily Log'
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-border py-16 text-center">
                    <UtensilsCrossed className="mx-auto h-12 w-12 text-slate-600" />
                    <h3 className="mt-4 text-base font-bold text-white">No menu scheduled for {dayOfWeekName}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      There are no dishes registered in the weekly menu for this day.
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}
