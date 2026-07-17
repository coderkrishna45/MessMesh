'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Papa from 'papaparse';
import { toast } from 'react-hot-toast';
import {
  Users,
  UserPlus,
  Upload,
  Search,
  Key,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  ArrowLeft,
  FileSpreadsheet,
  Download,
  ArrowUpDown,
  Filter,
  Copy,
  Trash2,
} from 'lucide-react';

const WINGS = ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];
const SAMPLE_CSV = `rollNumber,name,wing,email,phone
CS2023001,Harry Potter,A,harry@hostel.edu,9876543210
CS2023002,Hermione Granger,B,hermione@hostel.edu,9876543211
CS2023003,Ron Weasley,C,ron@hostel.edu,9876543212
CS2023004,Neville Longbottom,D,neville@hostel.edu,9876543213
`;

function normalizeWingClient(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (['A', 'A-WING', 'AWING'].includes(cleaned)) return 'A-Wing';
  if (['B', 'B-WING', 'BWING'].includes(cleaned)) return 'B-Wing';
  if (['C', 'C-WING', 'CWING'].includes(cleaned)) return 'C-Wing';
  if (['D', 'D-WING', 'DWING'].includes(cleaned)) return 'D-Wing';
  return null;
}

function copyText(text) {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  }
}

export default function ManageStudentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('manual');
  const [students, setStudents] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [wingFilter, setWingFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState('rollNumber');
  const [sortDir, setSortDir] = useState('asc');
  const [manualForm, setManualForm] = useState({
    name: '',
    rollNumber: '',
    wing: 'A-Wing',
    email: '',
    phone: '',
  });
  const [submittingManual, setSubmittingManual] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvParseErrors, setCsvParseErrors] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadingBulk, setUploadingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [resettedCredentials, setResettedCredentials] = useState(null);
  const [resettingId, setResettingId] = useState(null);

  const [error, setError] = useState('');

  const isWarden = session?.user?.role === 'WARDEN';

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const fetchStudents = useCallback(async () => {
    try {
      setLoadingList(true);
      setError('');
      const res = await fetch('/api/warden/students');
      const data = await res.json();
      if (data.success) {
        setStudents(data.students || []);
      } else {
        setError(data.error || 'Failed to load students.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while fetching the student list.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      if (session.user.role !== 'WARDEN') {
        router.push('/dashboard');
      } else {
        fetchStudents();
      }
    }
  }, [status, session, router, fetchStudents]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualForm.name.trim() || !manualForm.rollNumber.trim()) {
      setError('Name and Roll Number are required.');
      return;
    }
    if (!manualForm.email.trim()) {
      setError('Email is required.');
      return;
    }

    setSubmittingManual(true);
    setError('');
    setCreatedCredentials(null);
    setBulkResult(null);
    setResettedCredentials(null);

    try {
      const res = await fetch('/api/warden/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: {
            name: manualForm.name.trim(),
            rollNumber: manualForm.rollNumber.trim(),
            wing: manualForm.wing,
            email: manualForm.email.trim(),
            phone: manualForm.phone.trim(),
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.registered?.[0]) {
        setCreatedCredentials(data.registered[0]);
        toast.success('Student registered successfully!');
        setManualForm({
          name: '',
          rollNumber: '',
          wing: 'A-Wing',
          email: '',
          phone: '',
        });
        fetchStudents();
      } else {
        const reason =
          data.failed?.[0]?.reason || data.error || 'Failed to register student.';
        setError(reason);
        toast.error(reason);
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during student registration.');
    } finally {
      setSubmittingManual(false);
    }
  };

  const downloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'messmesh_students_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sample CSV downloaded');
  };

  const parseCsvFile = (file) => {
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a .csv file.');
      toast.error('Please upload a .csv file.');
      return;
    }

    setCsvFile(file);
    setBulkResult(null);
    setError('');
    setCsvPreview([]);
    setCsvParseErrors([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) =>
        h
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/rollno|roll_no|roll#/, 'rollnumber'),
      complete: (results) => {
        const rows = results.data || [];
        const preview = [];
        const parseErrors = [];
        const seenRolls = new Set();

        rows.forEach((row, idx) => {
          const line = idx + 2;
          const rollNumber = (
            row.rollnumber ||
            row.roll ||
            row.rollno ||
            ''
          )
            .toString()
            .trim();
          const name = (row.name || row.fullname || '').toString().trim();
          const email = (row.email || '').toString().trim();
          const phone = (row.phone || row.mobile || '').toString().trim();
          const wingRaw = (row.wing || '').toString().trim();
          const wing = normalizeWingClient(wingRaw);

          if (!rollNumber && !name && !wingRaw) return;

          if (!rollNumber || !name) {
            parseErrors.push({
              line,
              rollNumber: rollNumber || '—',
              reason: 'Missing rollNumber or name',
            });
            return;
          }
          if (!wing) {
            parseErrors.push({
              line,
              rollNumber,
              reason: `Invalid wing "${wingRaw}". Use A, B, C, or D`,
            });
            return;
          }
          if (seenRolls.has(rollNumber.toLowerCase())) {
            parseErrors.push({
              line,
              rollNumber,
              reason: 'Duplicate roll number in CSV',
            });
            return;
          }

          seenRolls.add(rollNumber.toLowerCase());
          preview.push({
            line,
            rollNumber,
            name,
            wing,
            email,
            phone,
          });
        });

        if (preview.length === 0 && parseErrors.length === 0) {
          setError(
            'No data rows found. Expected columns: rollNumber, name, wing, email, phone'
          );
        }

        setCsvPreview(preview);
        setCsvParseErrors(parseErrors);
      },
      error: (err) => {
        setError(`CSV parse error: ${err.message}`);
        toast.error('Failed to parse CSV');
      },
    });
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) parseCsvFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseCsvFile(file);
  };

  const clearCsv = () => {
    setCsvFile(null);
    setCsvPreview([]);
    setCsvParseErrors([]);
    setBulkResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBulkUpload = async () => {
    if (csvPreview.length === 0) {
      setError('No valid rows to upload. Fix the CSV preview first.');
      return;
    }

    setUploadingBulk(true);
    setError('');
    setBulkResult(null);
    setCreatedCredentials(null);
    setResettedCredentials(null);

    try {
      const res = await fetch('/api/warden/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: csvPreview.map((r) => ({
            rollNumber: r.rollNumber,
            name: r.name,
            wing: r.wing,
            email: r.email,
            phone: r.phone,
          })),
        }),
      });
      const data = await res.json();

      setBulkResult({
        successCount: data.successCount ?? data.registered?.length ?? 0,
        failCount: data.failCount ?? data.failed?.length ?? 0,
        registered: data.registered || [],
        failed: data.failed || [],
        message: data.message || data.error,
      });

      if (data.successCount > 0 || data.registered?.length > 0) {
        toast.success(
          `Registered ${data.successCount ?? data.registered.length} student(s)`
        );
        fetchStudents();
        if ((data.failCount ?? 0) === 0) {
          clearCsv();
        }
      } else {
        toast.error(data.error || 'Bulk upload failed');
        setError(data.error || 'Bulk upload failed');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during bulk upload.');
      toast.error('Bulk upload failed');
    } finally {
      setUploadingBulk(false);
    }
  };

  // Resets to RollNo@Mess2026 and forces change on next login
  const handleResetPassword = async (studentId) => {
    if (
      !confirm(
        "Reset this student's password to the default (RollNo@Mess2026)? They will be forced to change it on next login."
      )
    ) {
      return;
    }

    setResettingId(studentId);
    setError('');
    setResettedCredentials(null);
    setCreatedCredentials(null);

    try {
      const res = await fetch('/api/warden/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json();
      if (data.success) {
        setResettedCredentials(data);
        toast.success(data.message);
        fetchStudents();
      } else {
        setError(data.error || 'Failed to reset password.');
        toast.error(data.error || 'Failed to reset password.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during password reset.');
    } finally {
      setResettingId(null);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = students.filter((s) => {
      if (wingFilter !== 'ALL' && s.wing !== wingFilter) return false;
      if (!q) return true;
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.rollNumber || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.wing || '').toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'needsPasswordChange') {
        av = a.needsPasswordChange ? 1 : 0;
        bv = b.needsPasswordChange ? 1 : 0;
      }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [students, searchQuery, wingFilter, sortKey, sortDir]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal-dark text-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-primary border-t-transparent" />
      </div>
    );
  }

  if (!isWarden) return null;

  const SortHeader = ({ label, colKey, className = '' }) => (
    <th className={`py-3 px-4 ${className}`}>
      <button
        type="button"
        onClick={() => toggleSort(colKey)}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-white transition-colors"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${sortKey === colKey ? 'text-emerald-primary' : 'text-slate-600'}`}
        />
      </button>
    </th>
  );

  return (
    <div className="min-h-screen bg-charcoal-dark text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-border/60 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
                <Users className="h-8 w-8 text-emerald-primary" />
                Manage Students
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Add students manually or via CSV, review the roster, and reset
                credentials. Default password:{' '}
                <code className="text-amber-glow text-xs">RollNumber@Mess2026</code>
              </p>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg border border-slate-border bg-slate-card/50 hover:bg-slate-card p-2 text-slate-400 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 flex items-start gap-2">
              <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-2xl border border-slate-border bg-slate-card/25 overflow-hidden">
            <div className="flex border-b border-slate-border bg-charcoal-dark/40">
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === 'manual'
                    ? 'bg-emerald-primary/10 text-emerald-primary border-b-2 border-emerald-primary'
                    : 'text-slate-500 hover:text-white hover:bg-slate-card/40'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                Add Single Student
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('bulk')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === 'bulk'
                    ? 'bg-emerald-primary/10 text-emerald-primary border-b-2 border-emerald-primary'
                    : 'text-slate-500 hover:text-white hover:bg-slate-card/40'
                }`}
              >
                <Upload className="h-4 w-4" />
                Bulk Upload via CSV
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'manual' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">Register One Student</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Username will be the roll number. Default password is{' '}
                      <span className="text-amber-glow font-mono">
                        {'{RollNumber}@Mess2026'}
                      </span>
                      . Student must change password on first login.
                    </p>
                  </div>

                  <form onSubmit={handleManualSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Charlie Brown"
                          value={manualForm.name}
                          onChange={(e) =>
                            setManualForm({ ...manualForm, name: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-2.5 px-3 text-sm text-white outline-none focus:border-emerald-primary"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Roll Number (Username) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. CS2023001"
                          value={manualForm.rollNumber}
                          onChange={(e) =>
                            setManualForm({
                              ...manualForm,
                              rollNumber: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-2.5 px-3 text-sm text-white outline-none focus:border-emerald-primary font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Wing *
                        </label>
                        <select
                          value={manualForm.wing}
                          onChange={(e) =>
                            setManualForm({ ...manualForm, wing: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-2.5 px-3 text-sm text-white outline-none focus:border-emerald-primary cursor-pointer"
                        >
                          {WINGS.map((w) => (
                            <option key={w} value={w}>
                              {w.replace('-Wing', '')} ({w})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Email *
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. student@hostel.edu"
                          value={manualForm.email}
                          onChange={(e) =>
                            setManualForm({ ...manualForm, email: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-2.5 px-3 text-sm text-white outline-none focus:border-emerald-primary"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          placeholder="e.g. +91 9876543210"
                          value={manualForm.phone}
                          onChange={(e) =>
                            setManualForm({ ...manualForm, phone: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-2.5 px-3 text-sm text-white outline-none focus:border-emerald-primary"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingManual}
                      className="w-full rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 text-slate-950 py-3.5 font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 text-sm"
                    >
                      {submittingManual ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          Add Student
                        </>
                      )}
                    </button>
                  </form>

                  {createdCredentials && (
                    <div className="rounded-xl border border-emerald-primary/30 bg-emerald-primary/5 p-5 space-y-3">
                      <h4 className="font-extrabold text-white text-sm flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-emerald-primary" />
                        Student Created — Share These Credentials
                      </h4>
                      <div className="grid gap-2 sm:grid-cols-2 text-sm">
                        <div className="rounded-lg bg-charcoal-dark border border-slate-border p-3">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                            Name
                          </span>
                          <span className="font-bold text-white">
                            {createdCredentials.name}
                          </span>
                        </div>
                        <div className="rounded-lg bg-charcoal-dark border border-slate-border p-3">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                            Wing
                          </span>
                          <span className="font-bold text-white">
                            {createdCredentials.wing}
                          </span>
                        </div>
                        <div className="rounded-lg bg-charcoal-dark border border-slate-border p-3 relative">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                            Username (Roll No)
                          </span>
                          <span className="font-mono font-bold text-emerald-primary">
                            {createdCredentials.username}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(createdCredentials.username)}
                            className="absolute top-2 right-2 text-slate-500 hover:text-white"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="rounded-lg bg-charcoal-dark border border-amber-glow/30 p-3 relative">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                            Default Password
                          </span>
                          <span className="font-mono font-bold text-amber-glow">
                            {createdCredentials.password}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(createdCredentials.password)}
                            className="absolute top-2 right-2 text-slate-500 hover:text-white"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 italic">
                        Student will be forced to change this password on first
                        login.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'bulk' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">Bulk Upload via CSV</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-xl">
                        Upload a CSV with columns:{' '}
                        <code className="text-emerald-primary">
                          rollNumber, name, wing, email, phone
                        </code>
                        . Wing may be A/B/C/D or A-Wing. Preview and validate
                        before confirming upload.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={downloadSampleCsv}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-border bg-slate-card/50 hover:bg-slate-card px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white transition-all shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Sample CSV
                    </button>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`relative flex flex-col items-center justify-center w-full min-h-[140px] border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                      dragOver
                        ? 'border-emerald-primary bg-emerald-primary/5'
                        : 'border-slate-800 bg-charcoal-dark hover:border-slate-600 hover:bg-slate-900/40'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileSpreadsheet
                      className={`w-9 h-9 mb-2 ${
                        dragOver ? 'text-emerald-primary' : 'text-slate-500'
                      }`}
                    />
                    <p className="text-sm text-slate-300">
                      {csvFile ? (
                        <span className="font-semibold text-emerald-primary">
                          {csvFile.name}
                        </span>
                      ) : (
                        <>
                          <span className="font-semibold text-white">
                            Drag & drop
                          </span>{' '}
                          or click to select CSV
                        </>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Comma-separated values (*.csv)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </div>

                  {(csvPreview.length > 0 || csvParseErrors.length > 0) && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-3 text-xs">
                          <span className="rounded-full bg-emerald-primary/10 border border-emerald-primary/20 text-emerald-primary px-3 py-1 font-bold">
                            {csvPreview.length} valid row
                            {csvPreview.length !== 1 ? 's' : ''}
                          </span>
                          {csvParseErrors.length > 0 && (
                            <span className="rounded-full bg-terracotta/10 border border-terracotta/20 text-terracotta px-3 py-1 font-bold">
                              {csvParseErrors.length} invalid
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={clearCsv}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-wider"
                          >
                            <Trash2 className="h-3 w-3" />
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={handleBulkUpload}
                            disabled={uploadingBulk || csvPreview.length === 0}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-primary hover:bg-emerald-primary/95 disabled:opacity-40 px-4 py-2 text-xs font-bold text-slate-950 transition-all"
                          >
                            {uploadingBulk ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            Upload {csvPreview.length} Student
                            {csvPreview.length !== 1 ? 's' : ''}
                          </button>
                        </div>
                      </div>

                      {csvPreview.length > 0 && (
                        <div className="overflow-x-auto border border-slate-border rounded-xl">
                          <table className="w-full text-left text-xs min-w-[640px]">
                            <thead>
                              <tr className="border-b border-slate-border bg-charcoal-dark/60 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                <th className="py-2.5 px-3">#</th>
                                <th className="py-2.5 px-3">Roll No</th>
                                <th className="py-2.5 px-3">Name</th>
                                <th className="py-2.5 px-3">Wing</th>
                                <th className="py-2.5 px-3">Email</th>
                                <th className="py-2.5 px-3">Phone</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-border/30">
                              {csvPreview.map((row) => (
                                <tr key={`${row.rollNumber}-${row.line}`} className="hover:bg-slate-card/20">
                                  <td className="py-2 px-3 text-slate-500">{row.line}</td>
                                  <td className="py-2 px-3 font-mono text-emerald-primary font-semibold">
                                    {row.rollNumber}
                                  </td>
                                  <td className="py-2 px-3 text-white font-medium">
                                    {row.name}
                                  </td>
                                  <td className="py-2 px-3 text-slate-300">{row.wing}</td>
                                  <td className="py-2 px-3 text-slate-400">
                                    {row.email || (
                                      <span className="italic text-slate-600">
                                        auto
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-slate-400">
                                    {row.phone || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {csvParseErrors.length > 0 && (
                        <div className="rounded-xl border border-terracotta/20 bg-terracotta/5 p-4 space-y-2">
                          <h4 className="text-xs font-bold text-terracotta uppercase tracking-wider">
                            Validation issues (excluded from upload)
                          </h4>
                          <ul className="max-h-32 overflow-y-auto space-y-1 text-[11px] text-slate-400">
                            {csvParseErrors.map((err, i) => (
                              <li key={i}>
                                Line {err.line} ·{' '}
                                <span className="font-mono text-slate-300">
                                  {err.rollNumber}
                                </span>
                                : {err.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {bulkResult && (
                    <div className="rounded-xl border border-slate-border bg-charcoal-dark p-5 space-y-3">
                      <h4 className="font-extrabold text-white text-sm flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-emerald-primary" />
                        Upload Report
                      </h4>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <span className="rounded-full bg-emerald-primary/10 border border-emerald-primary/20 text-emerald-primary px-3 py-1 font-bold">
                          {bulkResult.successCount} succeeded
                        </span>
                        <span className="rounded-full bg-terracotta/10 border border-terracotta/20 text-terracotta px-3 py-1 font-bold">
                          {bulkResult.failCount} failed
                        </span>
                      </div>

                      {bulkResult.registered?.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-500 uppercase font-semibold">
                            New logins (password = Roll@Mess2026)
                          </p>
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-border/50 divide-y divide-slate-border/30">
                            {bulkResult.registered.map((r) => (
                              <div
                                key={r.id || r.rollNumber}
                                className="flex flex-wrap justify-between gap-2 px-3 py-2 text-xs"
                              >
                                <span className="text-white font-medium">
                                  {r.name}
                                </span>
                                <span className="font-mono text-emerald-primary">
                                  {r.username}
                                </span>
                                <span className="font-mono text-amber-glow">
                                  {r.password}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {bulkResult.failed?.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-terracotta uppercase font-semibold">
                            Failed entries
                          </p>
                          <ul className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-slate-400 list-disc list-inside">
                            {bulkResult.failed.map((f, i) => (
                              <li key={i}>
                                <span className="font-mono text-slate-300">
                                  {f.rollNumber}
                                </span>
                                {f.name ? ` (${f.name})` : ''}: {f.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {resettedCredentials && (
            <div className="rounded-2xl border border-amber-glow/25 bg-amber-glow/5 p-5 space-y-2">
              <h3 className="font-extrabold text-white text-sm flex items-center gap-1.5">
                <Key className="h-5 w-5 text-amber-glow" />
                Password Reset Successful
                {resettedCredentials.name ? ` — ${resettedCredentials.name}` : ''}
              </h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <p>
                  Username:{' '}
                  <span className="font-mono font-bold text-emerald-primary">
                    {resettedCredentials.username}
                  </span>
                </p>
                <p>
                  Password:{' '}
                  <span className="font-mono font-bold text-amber-glow">
                    {resettedCredentials.password}
                  </span>
                </p>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Student must change this password on next sign-in.
              </p>
            </div>
          )}

          <section className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-primary" />
                Student Roster
                <span className="text-xs font-normal text-slate-500">
                  ({filteredStudents.length}
                  {filteredStudents.length !== students.length
                    ? ` of ${students.length}`
                    : ''}
                  )
                </span>
              </h2>

              <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full lg:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search name, roll, email…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-card/45 py-2.5 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-primary"
                  />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                  <select
                    value={wingFilter}
                    onChange={(e) => setWingFilter(e.target.value)}
                    className="w-full sm:w-auto appearance-none rounded-xl border border-slate-800 bg-slate-card/45 py-2.5 pl-9 pr-8 text-xs text-white outline-none focus:border-emerald-primary cursor-pointer"
                  >
                    <option value="ALL">All Wings</option>
                    {WINGS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={fetchStudents}
                  disabled={loadingList}
                  className="rounded-xl border border-slate-border bg-slate-card/50 hover:bg-slate-card p-2.5 text-slate-400 hover:text-white transition-all"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>

            {loadingList ? (
              <div className="py-16 flex justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-emerald-primary" />
              </div>
            ) : filteredStudents.length > 0 ? (
              <div className="overflow-x-auto border border-slate-border rounded-xl bg-slate-card/10">
                <table className="w-full text-left border-collapse text-xs min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-border bg-charcoal-dark/50 text-[10px] text-slate-400 font-bold">
                      <SortHeader label="Roll No" colKey="rollNumber" />
                      <SortHeader label="Name" colKey="name" />
                      <SortHeader label="Wing" colKey="wing" />
                      <SortHeader label="Email" colKey="email" />
                      <SortHeader
                        label="Status"
                        colKey="needsPasswordChange"
                        className="text-center"
                      />
                      <th className="py-3 px-4 text-center uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-border/40">
                    {filteredStudents.map((student) => (
                      <tr key={student._id || student.id} className="hover:bg-slate-card/5">
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-300">
                          {student.rollNumber || '—'}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white">
                          {student.name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-medium">
                          {student.wing}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{student.email}</td>
                        <td className="py-3.5 px-4 text-center">
                          {student.needsPasswordChange ? (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-glow/10 border border-amber-glow/20 text-amber-glow">
                              Must Change PW
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-primary/10 border border-emerald-primary/20 text-emerald-primary">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() =>
                              handleResetPassword(student._id || student.id)
                            }
                            disabled={resettingId === (student._id || student.id)}
                            className="rounded-lg bg-charcoal-dark border border-slate-800 hover:border-amber-glow hover:text-amber-glow px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 transition-all inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            {resettingId === (student._id || student.id) ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Key className="h-3 w-3" />
                                Reset Password
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 border border-dashed border-slate-800 rounded-xl bg-slate-card/10 text-center text-slate-500 text-xs">
                {students.length === 0
                  ? 'No students in the registry yet. Add one above.'
                  : 'No students match your search / wing filter.'}
              </div>
            )}
          </section>
        </main>
      </div>

      <Footer />
    </div>
  );
}
