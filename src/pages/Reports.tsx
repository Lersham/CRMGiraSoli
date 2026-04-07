import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { FileText, Download, TrendingUp } from 'lucide-react';

interface Session {
  id: string;
  patientId: string;
  therapistId: string;
  date: string;
  durationMinutes: number;
  activityType: string;
  cost: number;
  status: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
}

interface Therapist {
  id: string;
  name: string;
}

interface ActivityStats {
  activityType: string;
  cost: number;
  hours: number;
}

interface PatientStats {
  patientName: string;
  totalCost: number;
  totalHours: number;
  activities: Record<string, ActivityStats>;
}

interface TherapistStats {
  therapistName: string;
  totalCost: number;
  totalHours: number;
  patients: Record<string, PatientStats>;
}

export default function Reports() {
  const { user, profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [patientsRes, sessionsRes, therapistsRes] = await Promise.all([
        supabase.from('patients').select('*'),
        supabase.from('sessions').select('*'),
        supabase.from('users').select('id, name')
      ]);

      if (patientsRes.error) console.error('Error fetching patients:', patientsRes.error);
      else setPatients(patientsRes.data as Patient[]);

      if (sessionsRes.error) console.error('Error fetching sessions:', sessionsRes.error);
      else setSessions(sessionsRes.data as Session[]);

      if (therapistsRes.error) console.error('Error fetching therapists:', therapistsRes.error);
      else setTherapists(therapistsRes.data as Therapist[]);
    };

    fetchData();

    const patientsSub = supabase
      .channel('patients_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, fetchData)
      .subscribe();

    const sessionsSub = supabase
      .channel('sessions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, fetchData)
      .subscribe();

    return () => {
      patientsSub.unsubscribe();
      sessionsSub.unsubscribe();
    };
  }, [user]);

  const filteredSessions = useMemo(() => {
    if (!month) return sessions;
    const start = startOfMonth(new Date(month + '-01'));
    const end = endOfMonth(new Date(month + '-01'));
    
    // Filter by month, status (only completed), and therapist (if not admin)
    return sessions.filter(s => {
      const isCompleted = s.status === 'completed' || !s.status; // fallback for old data
      const isRightMonth = isWithinInterval(parseISO(s.date), { start, end });
      const isRightTherapist = profile?.role === 'admin' ? true : s.therapistId === user?.id;
      return isCompleted && isRightMonth && isRightTherapist;
    });
  }, [sessions, month, profile, user]);

  const totalRevenue = filteredSessions.reduce((sum, s) => sum + s.cost, 0);
  const totalHours = filteredSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / 60;

  // Group by Therapist -> Patient -> Activity
  const detailedStats = useMemo(() => {
    const stats: Record<string, TherapistStats> = {};

    filteredSessions.forEach(s => {
      if (!stats[s.therapistId]) {
        const t = therapists.find(t => t.id === s.therapistId);
        stats[s.therapistId] = {
          therapistName: t ? t.name : 'Sconosciuto',
          totalCost: 0,
          totalHours: 0,
          patients: {}
        };
      }

      const therapistStats = stats[s.therapistId];
      therapistStats.totalCost += s.cost;
      therapistStats.totalHours += s.durationMinutes / 60;

      if (!therapistStats.patients[s.patientId]) {
        const p = patients.find(p => p.id === s.patientId);
        therapistStats.patients[s.patientId] = {
          patientName: p ? `${p.firstName} ${p.lastName}` : 'Sconosciuto',
          totalCost: 0,
          totalHours: 0,
          activities: {}
        };
      }

      const patientStats = therapistStats.patients[s.patientId];
      patientStats.totalCost += s.cost;
      patientStats.totalHours += s.durationMinutes / 60;

      if (!patientStats.activities[s.activityType]) {
        patientStats.activities[s.activityType] = {
          activityType: s.activityType,
          cost: 0,
          hours: 0
        };
      }

      const activityStats = patientStats.activities[s.activityType];
      activityStats.cost += s.cost;
      activityStats.hours += s.durationMinutes / 60;
    });

    return Object.values(stats).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredSessions, patients, therapists]);

  // For the chart, we can show total per patient across all therapists
  const chartData = useMemo(() => {
    const stats: Record<string, { name: string, cost: number, hours: number }> = {};
    filteredSessions.forEach(s => {
      if (!stats[s.patientId]) {
        const p = patients.find(p => p.id === s.patientId);
        stats[s.patientId] = {
          name: p ? `${p.firstName} ${p.lastName}` : 'Sconosciuto',
          cost: 0,
          hours: 0
        };
      }
      stats[s.patientId].cost += s.cost;
      stats[s.patientId].hours += s.durationMinutes / 60;
    });
    return Object.values(stats).sort((a, b) => b.cost - a.cost);
  }, [filteredSessions, patients]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Report e Fatturazione</h1>
        <div className="flex items-center gap-3">
          <input 
            type="month" 
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
            <Download size={20} />
            Esporta CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <TrendingUp size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Ricavi Totali ({format(new Date(month + '-01'), 'MMMM yyyy', { locale: it })})</p>
            <h2 className="text-3xl font-bold text-slate-900">€{totalRevenue.toFixed(2)}</h2>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
            <FileText size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Ore Erogate</p>
            <h2 className="text-3xl font-bold text-slate-900">{totalHours.toFixed(1)} h</h2>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Costi per Paziente</h3>
        
        {chartData.length > 0 ? (
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `€${value}`} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend />
                <Bar dataKey="cost" name="Costo Totale (€)" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            Nessun dato disponibile per il periodo selezionato.
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Dettaglio per Terapista e Paziente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-600">
                <th className="p-4">Terapista</th>
                <th className="p-4">Paziente</th>
                <th className="p-4">Attività</th>
                <th className="p-4 text-right">Ore Totali</th>
                <th className="p-4 text-right">Importo da Fatturare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailedStats.map((therapistStat, tIdx) => (
                <React.Fragment key={tIdx}>
                  {Object.keys(therapistStat.patients).map((patientId, pIdx) => {
                    const patientStat = therapistStat.patients[patientId];
                    return (
                    <React.Fragment key={`${tIdx}-${pIdx}`}>
                      {Object.keys(patientStat.activities).map((activityType, aIdx) => {
                        const activityStat = patientStat.activities[activityType];
                        return (
                        <tr key={`${tIdx}-${pIdx}-${aIdx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-medium text-slate-900">
                            {pIdx === 0 && aIdx === 0 ? therapistStat.therapistName : ''}
                          </td>
                          <td className="p-4 text-slate-800">
                            {aIdx === 0 ? patientStat.patientName : ''}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {activityStat.activityType}
                          </td>
                          <td className="p-4 text-right text-slate-600">{activityStat.hours.toFixed(1)} h</td>
                          <td className="p-4 text-right font-bold text-indigo-600">€{activityStat.cost.toFixed(2)}</td>
                        </tr>
                      );
                      })}
                      {/* Subtotal for patient */}
                      <tr className="bg-slate-50/50 border-t border-slate-100">
                        <td colSpan={3} className="p-3 text-right text-sm font-medium text-slate-500">
                          Totale {patientStat.patientName}
                        </td>
                        <td className="p-3 text-right text-sm font-medium text-slate-700">{patientStat.totalHours.toFixed(1)} h</td>
                        <td className="p-3 text-right text-sm font-bold text-slate-800">€{patientStat.totalCost.toFixed(2)}</td>
                      </tr>
                    </React.Fragment>
                    );
                  })}
                  {/* Subtotal for therapist */}
                  <tr className="bg-indigo-50/50 border-t-2 border-indigo-100">
                    <td colSpan={3} className="p-4 text-right text-sm font-bold text-indigo-900">
                      Totale {therapistStat.therapistName}
                    </td>
                    <td className="p-4 text-right text-sm font-bold text-indigo-900">{therapistStat.totalHours.toFixed(1)} h</td>
                    <td className="p-4 text-right text-sm font-bold text-indigo-900">€{therapistStat.totalCost.toFixed(2)}</td>
                  </tr>
                </React.Fragment>
              ))}
              {detailedStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Nessun dato disponibile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
