import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, User, Phone, Mail, Calendar } from 'lucide-react';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  diagnosis: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  assignedTherapists: string[];
  createdAt: string;
  createdBy: string;
  notes?: string;
}

export default function Patients() {
  const { user, profile } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [therapists, setTherapists] = useState<{id: string, name: string}[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    diagnosis: '',
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    assignedTherapists: [] as string[],
    customRate: '',
  });

  useEffect(() => {
    if (!user) return;

    const fetchPatients = async () => {
      const { data, error } = await supabase.from('patients').select('*');
      if (error) console.error('Error fetching patients:', error);
      else setPatients(data as Patient[]);
    };

    const fetchTherapists = async () => {
      const { data, error } = await supabase.from('users').select('id, name').order('name');
      if (error) console.error('Error fetching therapists:', error);
      else setTherapists(data || []);
    };

    fetchPatients();
    fetchTherapists();

    const subscription = supabase
      .channel('patients_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, fetchPatients)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const notesObj = formData.customRate ? { customRate: Number(formData.customRate) } : {};
      
      const { error } = await supabase.from('patients').insert([{
        firstName: formData.firstName,
        lastName: formData.lastName,
        dateOfBirth: formData.dateOfBirth,
        diagnosis: formData.diagnosis,
        parentName: formData.parentName,
        parentEmail: formData.parentEmail,
        parentPhone: formData.parentPhone,
        assignedTherapists: formData.assignedTherapists.length > 0 ? formData.assignedTherapists : [user.id],
        createdAt: new Date().toISOString(),
        createdBy: user.id,
        notes: Object.keys(notesObj).length > 0 ? JSON.stringify(notesObj) : null,
      }]);

      if (error) throw error;

      setIsModalOpen(false);
      setFormData({
        firstName: '', lastName: '', dateOfBirth: '', diagnosis: '',
        parentName: '', parentEmail: '', parentPhone: '', assignedTherapists: [], customRate: ''
      });
    } catch (error) {
      console.error('Error creating patient:', error);
    }
  };

  const handleTherapistToggle = (therapistId: string) => {
    setFormData(prev => {
      const isSelected = prev.assignedTherapists.includes(therapistId);
      if (isSelected) {
        return { ...prev, assignedTherapists: prev.assignedTherapists.filter(id => id !== therapistId) };
      } else {
        return { ...prev, assignedTherapists: [...prev.assignedTherapists, therapistId] };
      }
    });
  };

  const filteredPatients = patients.filter(p => 
    (profile?.role === 'admin' || p.assignedTherapists?.includes(user?.id || '')) &&
    (`${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.diagnosis?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Pazienti</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Nuovo Paziente
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Cerca per nome o diagnosi (es. DSA, ADHD)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPatients.map((patient) => (
          <div key={patient.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{patient.firstName} {patient.lastName}</h3>
                  <span className="inline-block px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                    {patient.diagnosis || 'Da definire'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-400" />
                <span>Nato il: {new Date(patient.dateOfBirth).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                <User size={16} className="text-slate-400" />
                <span className="font-medium text-slate-900">{patient.parentName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-slate-400" />
                <span>{patient.parentPhone || 'Non inserito'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-slate-400" />
                <span>{patient.parentEmail}</span>
              </div>
              {patient.notes && (() => {
                try {
                  const notesData = JSON.parse(patient.notes);
                  if (notesData.customRate) {
                    return (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-indigo-600">
                        <span className="font-medium">Tariffa Personalizzata:</span>
                        <span>€{notesData.customRate}/ora</span>
                      </div>
                    );
                  }
                } catch (e) {
                  return null;
                }
                return null;
              })()}
            </div>
          </div>
        ))}
        
        {filteredPatients.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500">
            Nessun paziente trovato.
          </div>
        )}
      </div>

      {/* Add Patient Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Aggiungi Nuovo Paziente</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
                  <input required type="text" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cognome</label>
                  <input required type="text" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full p-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Data di Nascita</label>
                <input required type="date" value={formData.dateOfBirth} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Diagnosi (es. DSA, ADHD)</label>
                <input type="text" value={formData.diagnosis} onChange={e => setFormData({...formData, diagnosis: e.target.value})} className="w-full p-2 border rounded-lg" />
              </div>
              <div className="pt-4 border-t border-slate-200">
                <h3 className="font-medium text-slate-900 mb-3">Dati Genitore/Tutore</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                    <input required type="text" value={formData.parentName} onChange={e => setFormData({...formData, parentName: e.target.value})} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input required type="email" value={formData.parentEmail} onChange={e => setFormData({...formData, parentEmail: e.target.value})} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                    <input type="tel" value={formData.parentPhone} onChange={e => setFormData({...formData, parentPhone: e.target.value})} className="w-full p-2 border rounded-lg" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <h3 className="font-medium text-slate-900 mb-3">Tariffe ed Eccezioni</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tariffa Oraria Personalizzata (€)</label>
                  <input 
                    type="number" 
                    value={formData.customRate} 
                    onChange={e => setFormData({...formData, customRate: e.target.value})} 
                    className="w-full p-2 border rounded-lg" 
                    placeholder="Lascia vuoto per usare la tariffa standard del terapista"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {profile?.role === 'admin' && (
                <div className="pt-4 border-t border-slate-200">
                  <h3 className="font-medium text-slate-900 mb-3">Assegna Terapisti</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-lg">
                    {therapists.map(therapist => (
                      <label key={therapist.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={formData.assignedTherapists.includes(therapist.id)}
                          onChange={() => handleTherapistToggle(therapist.id)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-700">{therapist.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Annulla</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Salva Paziente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
