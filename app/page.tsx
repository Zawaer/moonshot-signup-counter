"use client";

import { useEffect, useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import dynamic from 'next/dynamic'
import { createClient } from '@supabase/supabase-js';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css'

// init supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const Odometer = dynamic(() => import('react-odometerjs'), { 
  ssr: false, 
  loading: () => <span className="odometer">0</span> 
});

interface DataPoint {
  timestamp: string;
  count: number;
}

interface Stats {
  totalSignups: number;
  averagePerHour: number;
  peakSignupsPerHour: number;
  estimatedCompletion: Date | null;
  daysRemaining: number;
  lastDayGrowth: number;
}

export default function Home() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [currentCount, setCurrentCount] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeRange, setTimeRange] = useState<'all' | '7d' | '24h' | '1h'>('all');
  const TARGET_SIGNUPS = 5000;
  const LAUNCH_DATE = new Date('2025-10-07T00:30:00Z');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // fetch data from Supabase
        const { data: signupData, error } = await supabase
          .from('signups')
          .select('timestamp, count')
          .order('timestamp', { ascending: true });
        
        if (error) {
          console.error('Error fetching from Supabase:', error);
          setLoading(false);
          return;
        }

        if (!signupData || signupData.length === 0) {
          console.error('No data returned from Supabase');
          setLoading(false);
          return;
        }

        const parsedData: DataPoint[] = signupData.map((item) => ({
          timestamp: item.timestamp,
          count: Number(item.count ?? 0)
        }));

        setData(parsedData);

        if (parsedData.length > 0) {
          const latest = parsedData[parsedData.length - 1];
          setCurrentCount(latest.count);

          // delay setting the count slightly to allow odometer to mount first
          setTimeout(() => {
            setCurrentCount(latest.count);
          }, 300);

          const lastUpdateTime = new Date(latest.timestamp);
          const now = new Date();
          const diffMs = now.getTime() - lastUpdateTime.getTime();
          const diffMins = Math.max(0, Math.floor(diffMs / 60000));

          if (diffMins >= 1440) {
            const days = Math.floor(diffMins / 1440);
            const dayLabel = days === 1 ? 'day' : 'days';
            setLastUpdated(`${days} ${dayLabel} ago`);
          } else {
            setLastUpdated(diffMins === 0 ? '< 1 min ago' : `${diffMins} min ago`);
          }

            if (parsedData.length > 1) {
              const first = parsedData[0];
              const timeDiff = lastUpdateTime.getTime() - new Date(first.timestamp).getTime();
              const hoursDiff = timeDiff / (1000 * 60 * 60);
              const signupDiff = latest.count - first.count;
              const avgPerHour = signupDiff / Math.max(hoursDiff, 1e-6);

              // calculate peak signups per hour in a 1-hour time window
              const points = parsedData.map(p => ({
                ts: new Date(p.timestamp).getTime(),
                count: Number(p.count)
              }));

              const peakHourly = (() => {
                if (points.length < 2) return 0;

                const interpCount = (t: number) => {
                  if (t <= points[0].ts) return points[0].count;
                  if (t >= points[points.length - 1].ts) return points[points.length - 1].count;

                  let lo = 0;
                  let hi = points.length - 1;
                  while (lo <= hi) {
                    const mid = Math.floor((lo + hi) / 2);
                    if (points[mid].ts === t) return points[mid].count;
                    if (points[mid].ts < t) lo = mid + 1; else hi = mid - 1;
                  }

                  const right = lo;
                  const left = right - 1;
                  const pL = points[left];
                  const pR = points[right];
                  const frac = (t - pL.ts) / (pR.ts - pL.ts);
                  return pL.count + (pR.count - pL.count) * frac;
                };

                let maxPerHour = 0;
                const oneHourMs = 60 * 60 * 1000;

                for (let i = 0; i < points.length; i++) {
                  const t = points[i].ts;
                  const t0 = t - oneHourMs;
                  const cT = interpCount(t);
                  const cT0 = interpCount(t0);
                  const delta = cT - cT0;
                  const perHour = delta;
                  if (perHour > maxPerHour) maxPerHour = perHour;
                }

                return Math.max(0, maxPerHour);
              })();

              // calculate last 24h growth
              const oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);
              const recentData = parsedData.filter(d => new Date(d.timestamp).getTime() >= oneDayAgo);
              const lastDayGrowth = recentData.length > 1
                ? recentData[recentData.length - 1].count - recentData[0].count
                : 0;

              // estimated completion date
              const remaining = TARGET_SIGNUPS - latest.count;
              let estimatedCompletion = null;
              let daysRemaining = 0;

              if (avgPerHour > 0 && remaining > 0) {
                const hoursRemaining = remaining / avgPerHour;
                daysRemaining = Math.ceil(hoursRemaining / 24);
                estimatedCompletion = new Date(now.getTime() + (hoursRemaining * 60 * 60 * 1000));
              }

              setStats({
                totalSignups: latest.count,
                peakSignupsPerHour: Math.max(0, peakHourly),
                averagePerHour: avgPerHour,
                estimatedCompletion,
                daysRemaining,
                lastDayGrowth
              });
            }
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
    // refresh every min
    const interval = setInterval(fetchData, 60000);

    return () => clearInterval(interval);
  }, []);

  // update current count in realtime when signups table changes
  useEffect(() => {
    const channel = supabase
      .channel('public:signups')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signups' },
        (payload: unknown) => {
          try {
            const p = payload as { new?: Record<string, unknown>; old?: Record<string, unknown> };
            const rec = p.new ?? p.old;
            if (!rec) return;
            const raw = rec.count as unknown;
            const newCount = Number(raw as number | string);
            if (!isNaN(newCount)) {
              setCurrentCount(newCount);
              setLastUpdated('< 1 min ago');
            }
          } catch {
            // just ignore
          }
        }
      );

    channel.subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        try { channel.unsubscribe(); } catch { }
      }
    };
  }, []);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const percentage = TARGET_SIGNUPS > 0 ? (currentCount / TARGET_SIGNUPS) * 100 : 0;

  // filter data based on time range
  const getFilteredData = () => {
    if (timeRange === 'all') return data;

    const now = new Date().getTime();
    const msPerHour = 60 * 60 * 1000;
    const msPerDay = 24 * msPerHour;
    
    let cutoff: number;
    if (timeRange === '1h') {
      cutoff = now - msPerHour;
    } else if (timeRange === '7d') {
      cutoff = now - (7 * msPerDay);
    } else {
      cutoff = now - msPerDay;
    }

    return data.filter(d => new Date(d.timestamp).getTime() >= cutoff);
  };

  const filteredData = getFilteredData();

  const resampleTimeSeries = (points: DataPoint[]) => {
    if (!points || points.length === 0) return [] as { timestamp: string; count: number | null }[];

    const firstTs = new Date(points[0].timestamp).getTime();
    const lastTs = new Date(points[points.length - 1].timestamp).getTime();
    const span = lastTs - firstTs;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let bucketMs = hour;
  if (span <= hour) {
    bucketMs = minute;
  } else if (span <= day) {
    bucketMs = 10 * minute;
  } else if (span <= 7 * day) {
    bucketMs = hour;
  } else {
    const TARGET_POINTS = 240;
    const approx = Math.ceil(span / TARGET_POINTS);

    bucketMs = Math.max(approx, hour);

    const approxHours = Math.round(bucketMs / hour);
    if (approxHours <= 24) {
      bucketMs = approxHours * hour;
    } else {
      const approxDays = Math.max(1, Math.round(approxHours / 24));
      bucketMs = approxDays * day;
    }
  }

    const resampled: { timestamp: string; count: number | null }[] = [];
    let j = 0;

    for (let t = firstTs; t <= lastTs; t += bucketMs) {
      const bucketStart = t;
      const bucketEnd = t + bucketMs;

      while (j < points.length && new Date(points[j].timestamp).getTime() < bucketStart) j += 1;

      if (j < points.length) {
        const ptTs = new Date(points[j].timestamp).getTime();
        if (ptTs >= bucketStart && ptTs < bucketEnd) {
          resampled.push({ timestamp: new Date(bucketStart).toISOString(), count: points[j].count });
          j += 1;
          continue;
        }
      }

      resampled.push({ timestamp: new Date(bucketStart).toISOString(), count: null });
    }

    return resampled;
  };

  const resampled = resampleTimeSeries(filteredData);
  const chartData = resampled.map((d, i) => ({ ...d, index: i }));

  const interpolateAtIndex = (idx: number) => {
    const i = Math.floor(idx);
    let left = i - 1;
    while (left >= 0 && (chartData[left].count === null || chartData[left].count === undefined)) left -= 1;
    let right = i + 1;
    while (right < chartData.length && (chartData[right].count === null || chartData[right].count === undefined)) right += 1;

    const leftVal = left >= 0 ? chartData[left].count as number : null;
    const rightVal = right < chartData.length ? chartData[right].count as number : null;

    if (leftVal === null && rightVal === null) return null;
    if (leftVal === null) return rightVal;
    if (rightVal === null) return leftVal;

    const t = (i - left) / (right - left);
    return Math.round(leftVal + (rightVal - leftVal) * t);
  };

  return (
    <SkeletonTheme baseColor="#374151" highlightColor="#4b5563">
      <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-800">
        <main className="w-full mx-auto max-w-7xl">
          {/* header */}
          <div className="p-8 mb-8 bg-white border border-gray-200 shadow-md hover:shadow-lg dark:bg-gray-800 rounded-2xl dark:border-gray-700">
            <div className="flex flex-row items-center">
              <div className='flex flex-col justify-between w-full'>
                <h1 className="flex-1 min-w-0 mr-4 text-4xl font-bold text-gray-900 md:text-5xl dark:text-white">
                  Moonshot Signup Counter
                </h1>
                <p className="mt-2 text-base text-gray-600 dark:text-gray-400">
                  Realtime analytics for Moonshot signups
                </p>
              </div>
              <a
                href="https://github.com/Zawaer/moonshot-signup-counter"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open project on GitHub (new tab)"
                className="flex-shrink-0 p-2 ml-2 text-gray-900 transition-colors rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <svg height="64" width="64" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="block">
                  <path d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z"></path>
                </svg>
              </a>
            </div>
          </div>

          {/* goal reached panel */}
          {currentCount >= TARGET_SIGNUPS && (
            <div className="p-6 mb-6 bg-green-50 border border-green-200 rounded-2xl dark:bg-green-900/20 dark:border-green-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-4xl font-bold text-green-800 dark:text-green-200">Goal reached</h2>
                  <p className="mt-2 text-xl text-green-700 dark:text-green-100">Moonshot will be launching soon!</p>
                </div>
              </div>
            </div>
          )}

          {/* main stats grid */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            <div className="p-8 bg-white border border-gray-200 shadow-md hover:shadow-lg lg:col-span-2 dark:bg-gray-800 rounded-2xl dark:border-gray-700">
              <div className="text-center">
                <p className="mb-3 text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400">Current signups</p>
                <div className="mb-6 font-bold text-gray-900 text-7xl md:text-8xl dark:text-white min-h-[6rem] md:min-h-[8rem] flex items-center justify-center">
                  <Odometer value={currentCount} format="d" duration={2000} />
                </div>

                {/* progress Bar */}
                <div className="w-full h-10 mb-3 overflow-hidden bg-gray-200 rounded-full dark:bg-gray-700">
                  <div
                    className="flex text-white items-center justify-end h-10 pr-1 transition-all ease-out bg-blue-600 rounded-lg duration-2000 md:pr-2"
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  >
                    <Odometer value={percentage} format="d" animation='count'/>%
                  </div>
                </div>

                <div className="flex justify-between mb-4 text-xs text-gray-600 dark:text-gray-400">
                  <span>0</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">Goal: {TARGET_SIGNUPS}</span>
                </div>

                <div className="pt-8 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {loading ? <Skeleton width={200}/> : "Updated " + lastUpdated}
                  </p>
                </div>
              </div>
            </div>

            {/* prediction card */}
            <SkeletonTheme baseColor='#cbd5e1' highlightColor='#e2e8f0'>
              <div className="p-8 text-white shadow-md hover:shadow-lg bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-2xl">
                <div className="mb-4">
                  <h3 className="mb-4 text-xl font-semibold">Goal projection</h3>
                  <div className="w-full h-px bg-white/20"></div>
                </div>

                <p className="mb-2 text-xs tracking-wide uppercase opacity-80">Estimated completion</p>
                <p className="mb-4 text-lg font-semibold">{loading ? <Skeleton/> : stats?.estimatedCompletion ? formatDate(stats.estimatedCompletion) : currentCount >= TARGET_SIGNUPS ? "Completed" : "-"}</p>

                <div className="p-6 border bg-white/10 rounded-xl backdrop-blur-sm border-white/20">
                  <p className="mb-2 text-5xl font-bold">{stats?.daysRemaining && !loading ? stats.daysRemaining : currentCount >= TARGET_SIGNUPS ? "0" : <Skeleton/>}</p>
                  <p className="text-sm tracking-wide uppercase opacity-90">Days remaining</p>
                </div>

                <div className="pt-4 mt-4 border-t border-white/20">
                  <p className="text-xs opacity-75">{loading ? <Skeleton/> : "Based on current signup rate of " + stats?.averagePerHour.toFixed(1) + "/hour"}</p>
                </div>
              </div>
            </SkeletonTheme>
          </div>

          {/* detailed stats grid */}
          <div className="grid grid-cols-2 gap-6 mb-6 lg:grid-cols-4">
            <div className="p-6 transition-shadow bg-white border border-gray-200 shadow-md dark:bg-gray-800 rounded-xl dark:border-gray-700 hover:shadow-lg">
              <p className="mb-3 text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400">Last 24 hours</p>
              <p className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? <Skeleton/> : stats?.lastDayGrowth}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">New signups today</p>
            </div>

            <div className="p-6 transition-shadow bg-white border border-gray-200 shadow-md dark:bg-gray-800 rounded-xl dark:border-gray-700 hover:shadow-lg">
              <p className="mb-3 text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400">Avg per hour</p>
              <p className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? <Skeleton/> : stats?.averagePerHour.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Average signup rate</p>
            </div>

            <div className="p-6 transition-shadow bg-white border border-gray-200 shadow-md dark:bg-gray-800 rounded-xl dark:border-gray-700 hover:shadow-lg">
              <p className="mb-3 text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400">Peak per hour</p>
              <p className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? <Skeleton/> : stats?.peakSignupsPerHour.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Highest observed signups per hour</p>
            </div>

            <div className="p-6 transition-shadow bg-white border border-gray-200 shadow-md dark:bg-gray-800 rounded-xl dark:border-gray-700 hover:shadow-lg">
              <p className="mb-3 text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400">Remaining</p>
              <p className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
                {loading ? <Skeleton/> : currentCount >= TARGET_SIGNUPS ? "0" : TARGET_SIGNUPS - currentCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">To reach target</p>
            </div>
          </div>
        

          {/* chart card */}
          <div className="p-2 bg-white border border-gray-200 shadow-md hover:shadow-lg md:p-8 dark:bg-gray-800 rounded-2xl dark:border-gray-700">
            <div className="flex flex-col gap-4 p-4 mb-6 border-b border-gray-200 md:p-0 md:pb-8 md:flex-row md:items-center md:justify-between dark:border-gray-700">
              <div>
                <h2 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
                  Signup history
                </h2>
              </div>

              <div className="flex items-center gap-3">
                {/* time range filter */}
                <div className="flex p-1 bg-gray-100 rounded-lg dark:bg-gray-700">
                  <button
                    onClick={() => setTimeRange('1h')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      timeRange === '1h'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    1 hour
                  </button>

                  <button
                    onClick={() => setTimeRange('24h')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      timeRange === '24h'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    24 hours
                  </button>
                  <button
                    onClick={() => setTimeRange('7d')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      timeRange === '7d'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    7 days

                  </button>
                  <button
                    onClick={() => setTimeRange('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      timeRange === 'all'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    All time
                  </button>
                </div>

                <span className="hidden px-4 py-2 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg md:inline-flex dark:text-gray-400 dark:bg-gray-700">
                  {loading ? <Skeleton width={70}/> : filteredData.length + " records"}
                </span>
              </div>
            </div>

            <div className="w-full h-96">
              { loading ? <Skeleton className='h-96'/> :
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis
                      dataKey="index"
                      tickFormatter={(idx) => {
                        const i = Number(idx);
                        const point = chartData[i];
                        // for compact X axis ticks use time only, but show full date in tooltip
                        return point ? formatTime(point.timestamp) : '';
                      }}
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      stroke="#9ca3af"
                    />
                    <YAxis
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      stroke="#9ca3af"
                    />
                    
                    <Tooltip
                      labelFormatter={(label) => {
                        const i = Number(label);
                        const p = chartData[i];
                        return p ? formatDate(new Date(p.timestamp)) : '';
                      }}
                      formatter={(value: unknown, name: unknown, props: unknown) => {
                        if (value === null || value === undefined) {
                          const p = props as { label?: number } | undefined;
                          const idx = Number(p?.label ?? NaN);
                          const interp = interpolateAtIndex(idx);
                          return interp === null ? ['No data', 'Signups'] : [interp, 'Signups'];
                        }
                        return [Number(value as number), 'Signups'];
                      }}
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.98)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                      }}
                      labelStyle={{
                        color: '#1f2937',
                        fontWeight: '600',
                        marginBottom: '4px',
                        fontSize: '12px'
                      }}
                      itemStyle={{
                        color: '#2563eb',
                        fontWeight: '600',
                        fontSize: '14px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fill="url(#colorCount)"
                      dot={false}
                      activeDot={{ r: 5, stroke: '#2563eb', strokeWidth: 2, fill: '#fff' }}
                      connectNulls={true}
                      animationDuration={2000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              }
            </div>
          </div>

          {/* additional info section */}
          <div className="p-6 mt-6 bg-white border border-gray-200 shadow-md hover:shadow-lg dark:bg-gray-800 rounded-2xl dark:border-gray-700">
              <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Details</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg dark:bg-blue-900/30">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Event launched</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatDate(LAUNCH_DATE)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg dark:bg-green-900/30">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Campaign status</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {loading ? <Skeleton/> : percentage >= 100 ? 'Completed' : percentage >= 80 ? 'Near completion' : percentage >= 50 ? 'On track' : 'In progress'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg dark:bg-purple-900/30">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Auto refresh</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Every 60 seconds</p>
                  </div>
                </div>
              </div>
            </div>
        </main>
      </div>
    </SkeletonTheme>
  );
}