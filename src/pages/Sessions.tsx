import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Clock, FileText, Activity } from 'lucide-react';

interface Session {
  id: string;
  patientId: string;
  therapistId: string;
  date: string;
  durationMinutes: number;
  activityType: string;
  notes: string;
  cost: number;
  status: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  notes?: string;
}

export default function Sessions() {
  const { user, profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    patientId: '',
    date: new Date().toISOString().slice(0, 16),
    durationMinutes: 60,
    activityType: 'Terapia Cognitivo-Comportamentale',
    notes: '',
    cost: profile?.hourlyRate || 60,
    status: 'completed',
  });

  const calculateCost = (patientId: string, duration: number) => {
    let baseRate = profile?.hourlyRate || 60;
    if (patientId) {
      const patient = patients.find(p => p.id === patientId);
      if (patient?.notes) {
        try {
          const notesData = JSON.parse(patient.notes);
          if (notesData.customRate) {
            baseRate = Number(notesData.customRate);
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    }
    return (baseRate / 60) * duration;
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [patientsRes, sessionsRes] = await Promise.all([
        supabase.from('patients').select('*'),
        supabase.from('sessions').select('*').order('date', { ascending: false })
      ]);

      if (patientsRes.error) console.error('Error fetching patients:', patientsRes.error);
      else setPatients(patientsRes.data as Patient[]);

      if (sessionsRes.error) console.error('Error fetching sessions:', sessionsRes.error);
      else setSessions(sessionsRes.data as Session[]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { error } = await supabase.from('sessions').insert([{
        ...formData,
        therapistId: user.id,
        date: new Date(formData.date).toISOString(),
        durationMinutes: Number(formData.durationMinutes),
        cost: Number(formData.cost),
      }]);

      if (error) throw error;

      setIsModalOpen(false);
      setFormData({ ...formData, notes: '' });
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const handleStatusChange = async (sessionId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('sessions').update({ status: newStatus }).eq('id', sessionId);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating session status:', error);
    }
  };

  const getPatientName = (id: string) => {
    const p = patients.find(p => p.id === id);
    return p ? `${p.firstName} ${p.lastName}` : 'Sconosciuto';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Time Tracking & Sessioni</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Registra Sessione
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-600">
                <th className="p-4">Data e Ora</th>
                <th className="p-4">Paziente</th>
                <th className="p-4">Attività</th>
                <th className="p-4">Durata</th>
                <th className="p-4">Costo</th>
                <th className="p-4">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-sm text-slate-900">
                    {new Date(session.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="p-4 font-medium text-indigo-600">
                    {getPatientName(session.patientId)}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Activity size={16} className="text-slate-400" />
                      {session.activityType}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-slate-400" />
                      {session.durationMinutes} min
                    </div>
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-900">
                    €{session.cost.toFixed(2)}
                  </td>
                  <td className="p-4 text-sm">
                    <select
                      value={session.status || 'completed'}
                      onChange={(e) => handleStatusChange(session.id, e.target.value)}
                      className={`p-1.5 rounded-md text-xs font-medium border ${
                        session.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        session.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        session.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-orange-50 text-orange-700 border-orange-200'
                      }`}
                    >
                      <option value="scheduled">Programmata</option>
                      <option value="completed">Completata</option>
                      <option value="cancelled">Annullata</option>
                      <option value="no-show">Assente</option>
                    </select>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Nessuna sessione registrata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Registra Nuova Sessione</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paziente</label>
                <select required value={formData.patientId} onChange={e => {
                  const newPatientId = e.target.value;
                  setFormData({
                    ...formData, 
                    patientId: newPatientId,
                    cost: calculateCost(newPatientId, formData.durationMinutes)
                  });
                }} className="w-full p-2 border rounded-lg bg-white">
                  <option value="">Seleziona paziente...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Data e Ora</label>
                <input required type="datetime-local" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2 border rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Durata (minuti)</label>
                  <input required type="number" min="1" value={formData.durationMinutes} onChange={e => {
                    const newDuration = Number(e.target.value);
                    setFormData({
                      ...formData, 
                      durationMinutes: newDuration,
                      cost: calculateCost(formData.patientId, newDuration)
                    });
                  }} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo (€)</label>
                  <input required type="number" min="0" step="0.01" value={formData.cost} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Attività</label>
                <select required value={formData.activityType} onChange={e => setFormData({...formData, activityType: e.target.value})} className="w-full p-2 border rounded-lg bg-white">
                  <option value="Terapia Cognitivo-Comportamentale">Terapia Cognitivo-Comportamentale</option>
                  <option value="Valutazione Diagnostica">Valutazione Diagnostica</option>
                  <option value="Colloquio Genitori">Colloquio Genitori</option>
                  <option value="Terapia di Gruppo">Terapia di Gruppo</option>
                  <option value="Altro">Altro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stato</label>
                <select required value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2 border rounded-lg bg-white">
                  <option value="scheduled">Programmata</option>
                  <option value="completed">Completata</option>
                  <option value="cancelled">Annullata</option>
                  <option value="no-show">Assente</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note (Opzionale)</label>
                <textarea rows={3} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2 border rounded-lg resize-none" placeholder="Note sulla sessione..."></textarea>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Annulla</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Salva Sessione</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
