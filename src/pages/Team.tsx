import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shield, Mail, Trash2, Edit2, Info } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  hourlyRate: number | null;
}

export default function Team() {
  const { user, profile } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  
  const [formData, setFormData] = useState({
    role: 'therapist',
    hourlyRate: ''
  });

  useEffect(() => {
    if (!user) return;

    const fetchTeam = async () => {
      const { data, error } = await supabase.from('users').select('*').order('name');
      if (error) console.error('Error fetching team:', error);
      else setTeam(data as TeamMember[]);
    };

    fetchTeam();

    const subscription = supabase
      .channel('users_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchTeam)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      role: member.role || 'therapist',
      hourlyRate: member.hourlyRate ? member.hourlyRate.toString() : ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || profile?.role !== 'admin' || !editingMember) return;
    
    try {
      const { error } = await supabase.from('users').update({
        role: formData.role,
        hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : null,
      }).eq('id', editingMember.id);

      if (error) throw error;

      setIsModalOpen(false);
      setEditingMember(null);
    } catch (error) {
      console.error('Error updating team member:', error);
      alert('Errore durante l\'aggiornamento del profilo.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo profilo? (Nota: questo non eliminerà l\'account di accesso del terapista, ma solo il suo profilo pubblico)')) return;
    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting team member:', error);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4 pt-20">
        <Shield size={48} className="text-slate-300" />
        <p className="text-lg">Accesso negato. Solo gli amministratori possono gestire il team.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Gestione Team</h1>
      </div>

      <div className="bg-blue-50 text-blue-800 p-4 rounded-xl flex items-start gap-3 border border-blue-100">
        <Info className="shrink-0 mt-0.5" size={20} />
        <div className="text-sm">
          <p className="font-semibold mb-1">Come aggiungere nuovi membri al team?</p>
          <p>Per motivi di sicurezza, i nuovi terapisti devono registrarsi autonomamente dalla pagina di login iniziale. Una volta registrati, il loro profilo apparirà automaticamente in questa lista e potrai modificarne il ruolo (Admin/Terapista) e la tariffa oraria.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
              <th className="p-4 font-medium">Nome</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Ruolo</th>
              <th className="p-4 font-medium">Tariffa Oraria</th>
              <th className="p-4 font-medium text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {team.map((member) => (
              <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                      {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <span className="font-medium text-slate-900">{member.name || 'Utente'}</span>
                  </div>
                </td>
                <td className="p-4 text-slate-600">
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-slate-400" />
                    {member.email}
                  </div>
                </td>
                <td className="p-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                    member.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {member.role}
                  </span>
                </td>
                <td className="p-4 text-slate-600">
                  {member.hourlyRate ? `€${member.hourlyRate}/h` : '-'}
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => handleEdit(member)}
                      className="text-slate-500 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Modifica"
                    >
                      <Edit2 size={18} />
                    </button>
                    {member.id !== user?.id && (
                      <button 
                        onClick={() => handleDelete(member.id)}
                        className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Elimina"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {team.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  Nessun membro del team trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && editingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Modifica Profilo: {editingMember.name}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ruolo</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-2 border rounded-lg bg-white">
                  <option value="therapist">Terapista</option>
                  <option value="admin">Amministratore</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tariffa Oraria (€) - Opzionale</label>
                <input type="number" step="0.01" min="0" value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: e.target.value})} className="w-full p-2 border rounded-lg" />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => { setIsModalOpen(false); setEditingMember(null); }} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Annulla</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Salva Modifiche</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
