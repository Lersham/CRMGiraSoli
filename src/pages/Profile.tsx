import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { User, Euro, Save } from 'lucide-react';

export default function Profile() {
  const { user, profile } = useAuth();
  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (profile) {
      setHourlyRate(profile.hourlyRate ? profile.hourlyRate.toString() : '');
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setMessage('');

    try {
      const { error } = await supabase.from('users').update({
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      }).eq('id', user.id);

      if (error) throw error;
      
      setMessage('Profilo aggiornato con successo. Ricarica la pagina per applicare le modifiche.');
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage('Errore durante l\'aggiornamento del profilo.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Il Mio Profilo</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl font-bold">
            {profile.name?.charAt(0) || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
            <p className="text-slate-500 capitalize">{profile.role}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="pl-10 w-full p-2 border rounded-lg bg-slate-50 text-slate-500"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">L'email non può essere modificata.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tariffa Oraria Predefinita (€)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Euro className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="pl-10 w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Es. 60"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Questa tariffa verrà utilizzata come base per il calcolo dei costi delle sessioni.
            </p>
          </div>

          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.includes('Errore') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Save size={20} />
              {isSaving ? 'Salvataggio...' : 'Salva Modifiche'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
