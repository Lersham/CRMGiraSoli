import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Calendar as CalendarIcon, Clock, MapPin, Settings, Trash2, Edit2, X, User } from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';

interface Room {
  id: string;
  name: string;
  capacity: number;
}

interface Booking {
  id: string;
  roomId: string;
  therapistId: string;
  patientId: string | null;
  startTime: string;
  endTime: string;
  title: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  notes?: string;
}

export default function Rooms() {
  const { user, profile } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);

  const [bookingData, setBookingData] = useState({
    roomId: '',
    patientId: '',
    title: '',
    startTime: new Date().toISOString().slice(0, 16),
    duration: 60,
    activityType: 'Terapia Cognitivo-Comportamentale',
    cost: profile?.hourlyRate || 60,
    isRecurring: false,
    recurringWeeks: 1,
  });

  const [roomData, setRoomData] = useState({
    name: '',
    capacity: 2,
    description: ''
  });

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [roomsRes, bookingsRes, patientsRes] = await Promise.all([
        supabase.from('rooms').select('*'),
        supabase.from('bookings').select('*').order('startTime', { ascending: true }),
        supabase.from('patients').select('id, firstName, lastName, notes').order('firstName')
      ]);

      if (roomsRes.error) console.error('Error fetching rooms:', roomsRes.error);
      else setRooms(roomsRes.data as Room[]);

      if (bookingsRes.error) console.error('Error fetching bookings:', bookingsRes.error);
      else setBookings(bookingsRes.data as Booking[]);

      if (patientsRes.error) console.error('Error fetching patients:', patientsRes.error);
      else setPatients(patientsRes.data as Patient[]);
    };

    fetchData();

    const roomsSub = supabase
      .channel('rooms_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchData)
      .subscribe();

    const bookingsSub = supabase
      .channel('bookings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchData)
      .subscribe();

    return () => {
      roomsSub.unsubscribe();
      bookingsSub.unsubscribe();
    };
  }, [user]);

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

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (editingBookingId) {
      try {
        const start = new Date(bookingData.startTime);
        const end = new Date(start.getTime() + bookingData.duration * 60000);
        const originalBooking = bookings.find(b => b.id === editingBookingId);

        const { error } = await supabase.from('bookings').update({
          roomId: bookingData.roomId,
          patientId: bookingData.patientId || null,
          title: bookingData.title,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        }).eq('id', editingBookingId);
        
        if (error) throw error;

        // Update corresponding session if it exists
        if (originalBooking && originalBooking.patientId) {
          if (bookingData.patientId) {
            await supabase.from('sessions').update({
              patientId: bookingData.patientId,
              date: start.toISOString(),
              durationMinutes: bookingData.duration,
              activityType: bookingData.activityType,
              cost: bookingData.cost,
            }).match({
              patientId: originalBooking.patientId,
              therapistId: user.id,
              date: originalBooking.startTime
            });
          } else {
            // Patient removed, delete session
            await supabase.from('sessions').delete().match({
              patientId: originalBooking.patientId,
              therapistId: user.id,
              date: originalBooking.startTime
            });
          }
        } else if (bookingData.patientId) {
          // Patient added, create session
          await supabase.from('sessions').insert([{
            patientId: bookingData.patientId,
            therapistId: user.id,
            date: start.toISOString(),
            durationMinutes: bookingData.duration,
            activityType: bookingData.activityType,
            cost: bookingData.cost,
            status: 'scheduled',
            notes: 'Generata da prenotazione stanza'
          }]);
        }
        
        setIsBookingModalOpen(false);
        setEditingBookingId(null);
      } catch (error) {
        console.error('Error updating booking:', error);
      }
      return;
    }

    const newBookings = [];
    const weeks = bookingData.isRecurring ? bookingData.recurringWeeks : 1;
    
    for (let i = 0; i < weeks; i++) {
      const start = new Date(bookingData.startTime);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start.getTime() + bookingData.duration * 60000);
      
      const hasOverlap = bookings.some(b => {
        if (b.roomId !== bookingData.roomId) return false;
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        return (start.getTime() < bEnd && end.getTime() > bStart);
      });

      if (hasOverlap) {
        alert(`Attenzione: La stanza è già prenotata per la data ${start.toLocaleDateString()}. Prenotazione interrotta.`);
        return;
      }
      
      newBookings.push({
        roomId: bookingData.roomId,
        patientId: bookingData.patientId || null,
        title: bookingData.title,
        therapistId: user.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
    }

    try {
      const { data: insertedBookings, error } = await supabase.from('bookings').insert(newBookings).select();
      if (error) throw error;

      if (bookingData.patientId && insertedBookings) {
        const newSessions = insertedBookings.map(b => ({
          patientId: b.patientId,
          therapistId: b.therapistId,
          date: b.startTime,
          durationMinutes: bookingData.duration,
          activityType: bookingData.activityType,
          cost: bookingData.cost,
          status: 'scheduled',
          notes: 'Generata da prenotazione stanza'
        }));
        await supabase.from('sessions').insert(newSessions);
      }

      setIsBookingModalOpen(false);
      setBookingData({ ...bookingData, title: '', isRecurring: false, recurringWeeks: 1 });
    } catch (error) {
      console.error('Error creating bookings:', error);
    }
  };

  const handleDeleteBooking = async (id: string) => {
    if (!window.confirm('Sei sicuro di voler eliminare questa prenotazione?')) return;
    try {
      const bookingToDelete = bookings.find(b => b.id === id);
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;

      if (bookingToDelete && bookingToDelete.patientId) {
        await supabase.from('sessions').delete().match({
          patientId: bookingToDelete.patientId,
          therapistId: user.id,
          date: bookingToDelete.startTime
        });
      }

      setViewBooking(null);
    } catch (error) {
      console.error('Error deleting booking:', error);
    }
  };

  const handleEditClick = async (booking: Booking) => {
    // Format dates for datetime-local input (YYYY-MM-DDThh:mm)
    const formatForInput = (isoString: string) => {
      const d = new Date(isoString);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };

    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const validDurations = [60, 90, 120, 150, 180];
    const duration = validDurations.includes(diffMinutes) ? diffMinutes : 60;

    let activityType = 'Terapia Cognitivo-Comportamentale';
    let cost = calculateCost(booking.patientId || '', duration);

    if (booking.patientId) {
      try {
        const { data: sessionData } = await supabase.from('sessions').select('activityType, cost').match({
          patientId: booking.patientId,
          therapistId: user?.id,
          date: booking.startTime
        }).single();
        
        if (sessionData) {
          activityType = sessionData.activityType;
          cost = sessionData.cost;
        }
      } catch (e) {
        console.error('Error fetching session for edit:', e);
      }
    }

    setBookingData({
      roomId: booking.roomId,
      patientId: booking.patientId || '',
      title: booking.title,
      startTime: formatForInput(booking.startTime),
      duration: duration,
      activityType,
      cost,
      isRecurring: false,
      recurringWeeks: 1
    });
    setEditingBookingId(booking.id);
    setViewBooking(null);
    setIsBookingModalOpen(true);
  };

  const openNewBookingModal = () => {
    setEditingBookingId(null);
    const now = new Date();
    
    const formatForInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    setBookingData({
      roomId: '',
      patientId: '',
      title: '',
      startTime: formatForInput(now),
      duration: 60,
      activityType: 'Terapia Cognitivo-Comportamentale',
      cost: profile?.hourlyRate || 60,
      isRecurring: false,
      recurringWeeks: 1
    });
    setIsBookingModalOpen(true);
  };

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || profile?.role !== 'admin') return;
    try {
      const { error } = await supabase.from('rooms').insert([{
        name: roomData.name,
        capacity: Number(roomData.capacity),
        description: roomData.description
      }]);
      
      if (error) throw error;

      setIsRoomModalOpen(false);
      setRoomData({ name: '', capacity: 2, description: '' });
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const filteredBookings = bookings.filter(b => 
    isSameDay(parseISO(b.startTime), parseISO(selectedDate))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Prenotazione Stanze</h1>
        <div className="flex gap-3">
          {profile?.role === 'admin' && (
            <button
              onClick={() => setIsRoomModalOpen(true)}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Settings size={20} />
              Gestisci Stanze
            </button>
          )}
          <button
            onClick={openNewBookingModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            Nuova Prenotazione
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-6">
          <label className="font-medium text-slate-700 flex items-center gap-2">
            <CalendarIcon size={20} className="text-indigo-600" />
            Data:
          </label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="space-y-4">
          {rooms.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nessuna stanza configurata. {profile?.role === 'admin' ? 'Aggiungi una stanza per iniziare.' : "Contatta l'amministratore."}
            </div>
          ) : (
            rooms.map(room => {
              const roomBookings = filteredBookings.filter(b => b.roomId === room.id);
              return (
                <div key={room.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin size={20} className="text-indigo-600" />
                    <h3 className="font-bold text-lg text-slate-900">{room.name}</h3>
                  </div>
                  
                  {roomBookings.length > 0 ? (
                    <div className="mt-8 relative">
                      {/* Timeline markers */}
                      <div className="absolute top-0 left-0 right-0 h-4 -mt-5">
                        {Array.from({ length: 13 }).map((_, i) => (
                          <span key={i} className="absolute text-xs text-slate-400 -translate-x-1/2" style={{ left: `${(i / 12) * 100}%` }}>
                            {i + 8}:00
                          </span>
                        ))}
                      </div>
                      <div className="relative h-16 bg-white border border-slate-200 rounded-lg overflow-hidden">
                        {/* Grid lines */}
                        {Array.from({ length: 13 }).map((_, i) => (
                          <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${(i / 12) * 100}%` }} />
                        ))}
                        
                        {/* Bookings */}
                        {roomBookings.map(booking => {
                          const start = new Date(booking.startTime);
                          const end = new Date(booking.endTime);
                          
                          // Calculate position relative to 08:00 - 20:00
                          const startMinutes = (start.getHours() - 8) * 60 + start.getMinutes();
                          const endMinutes = (end.getHours() - 8) * 60 + end.getMinutes();
                          
                          // Clamp values
                          const clampedStart = Math.max(0, Math.min(720, startMinutes));
                          const clampedEnd = Math.max(0, Math.min(720, endMinutes));
                          
                          const left = (clampedStart / 720) * 100;
                          const width = ((clampedEnd - clampedStart) / 720) * 100;
                          
                          if (width <= 0) return null; // Outside timeline hours
                          
                          return (
                            <div 
                              key={booking.id} 
                              onClick={() => setViewBooking(booking)}
                              className="absolute top-1 bottom-1 bg-indigo-100 border border-indigo-300 rounded-md px-2 py-1 overflow-hidden hover:bg-indigo-200 transition-colors cursor-pointer group shadow-sm hover:shadow-md"
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${booking.title} (${format(start, 'HH:mm')} - ${format(end, 'HH:mm')})`}
                            >
                              <p className="text-xs font-bold text-indigo-800 truncate">{booking.title}</p>
                              <p className="text-[10px] text-indigo-600 truncate">{format(start, 'HH:mm')} - {format(end, 'HH:mm')}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-8 relative">
                      {/* Timeline markers */}
                      <div className="absolute top-0 left-0 right-0 h-4 -mt-5">
                        {Array.from({ length: 13 }).map((_, i) => (
                          <span key={i} className="absolute text-xs text-slate-400 -translate-x-1/2" style={{ left: `${(i / 12) * 100}%` }}>
                            {i + 8}:00
                          </span>
                        ))}
                      </div>
                      <div className="relative h-16 bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
                        {/* Grid lines */}
                        {Array.from({ length: 13 }).map((_, i) => (
                          <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${(i / 12) * 100}%` }} />
                        ))}
                        <p className="text-sm text-slate-400 italic z-10 bg-white/80 px-2 rounded">Nessuna prenotazione per questa data.</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* View Booking Modal */}
      {viewBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-slate-900">{viewBooking.title}</h2>
              <button onClick={() => setViewBooking(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock size={18} />
                <span>
                  {format(new Date(viewBooking.startTime), 'dd/MM/yyyy')} <br/>
                  {format(new Date(viewBooking.startTime), 'HH:mm')} - {format(new Date(viewBooking.endTime), 'HH:mm')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin size={18} />
                <span>{rooms.find(r => r.id === viewBooking.roomId)?.name}</span>
              </div>
              {viewBooking.patientId && (
                <div className="flex items-center gap-2 text-slate-600">
                  <User size={18} />
                  <span>
                    {patients.find(p => p.id === viewBooking.patientId)?.firstName}{' '}
                    {patients.find(p => p.id === viewBooking.patientId)?.lastName}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => handleEditClick(viewBooking)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
              >
                <Edit2 size={18} /> Modifica
              </button>
              <button 
                onClick={() => handleDeleteBooking(viewBooking.id)}
                className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
              >
                <Trash2 size={18} /> Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingBookingId ? 'Modifica Prenotazione' : 'Prenota Stanza'}</h2>
            <form onSubmit={handleBookingSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stanza</label>
                <select required value={bookingData.roomId} onChange={e => setBookingData({...bookingData, roomId: e.target.value})} className="w-full p-2 border rounded-lg bg-white">
                  <option value="">Seleziona stanza...</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paziente</label>
                <select value={bookingData.patientId} onChange={e => {
                  const newPatientId = e.target.value;
                  setBookingData({
                    ...bookingData, 
                    patientId: newPatientId,
                    cost: calculateCost(newPatientId, bookingData.duration)
                  });
                }} className="w-full p-2 border rounded-lg bg-white">
                  <option value="">Nessun paziente specifico</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                  ))}
                </select>
              </div>
              
              {bookingData.patientId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Attività</label>
                    <select 
                      value={bookingData.activityType} 
                      onChange={e => setBookingData({...bookingData, activityType: e.target.value})} 
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="Terapia Cognitivo-Comportamentale">Terapia Cognitivo-Comportamentale</option>
                      <option value="Valutazione Diagnostica">Valutazione Diagnostica</option>
                      <option value="Colloquio Genitori">Colloquio Genitori</option>
                      <option value="Terapia di Gruppo">Terapia di Gruppo</option>
                      <option value="Altro">Altro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Costo (€)</label>
                    <input 
                      type="number" 
                      value={bookingData.cost} 
                      onChange={e => setBookingData({...bookingData, cost: Number(e.target.value)})} 
                      className="w-full p-2 border rounded-lg" 
                      min="0" 
                      step="0.01" 
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Titolo/Motivo</label>
                <input required type="text" value={bookingData.title} onChange={e => setBookingData({...bookingData, title: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Es. Colloquio Rossi" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Inizio</label>
                  <input required type="datetime-local" value={bookingData.startTime} onChange={e => setBookingData({...bookingData, startTime: e.target.value})} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Durata</label>
                  <select required value={bookingData.duration} onChange={e => {
                    const newDuration = Number(e.target.value);
                    setBookingData({
                      ...bookingData, 
                      duration: newDuration,
                      cost: calculateCost(bookingData.patientId, newDuration)
                    });
                  }} className="w-full p-2 border rounded-lg bg-white">
                    <option value={60}>1 ora</option>
                    <option value={90}>1 ora e mezza</option>
                    <option value={120}>2 ore</option>
                    <option value={150}>2 ore e mezza</option>
                    <option value={180}>3 ore</option>
                  </select>
                </div>
              </div>

              {!editingBookingId && (
                <>
                  <div className="flex items-center gap-2 mt-4">
                    <input 
                      type="checkbox" 
                      id="isRecurring" 
                      checked={bookingData.isRecurring} 
                      onChange={e => setBookingData({...bookingData, isRecurring: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <label htmlFor="isRecurring" className="text-sm font-medium text-slate-700">
                      Ripeti ogni settimana
                    </label>
                  </div>

                  {bookingData.isRecurring && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Per quante settimane?</label>
                      <input 
                        type="number" 
                        min="2" 
                        max="52" 
                        value={bookingData.recurringWeeks} 
                        onChange={e => setBookingData({...bookingData, recurringWeeks: Number(e.target.value)})} 
                        className="w-full p-2 border rounded-lg" 
                      />
                    </div>
                  )}
                </>
              )}
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsBookingModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Annulla</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  {editingBookingId ? 'Salva Modifiche' : 'Conferma Prenotazione'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRoomModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Aggiungi Nuova Stanza</h2>
            <form onSubmit={handleRoomSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Stanza</label>
                <input required type="text" value={roomData.name} onChange={e => setRoomData({...roomData, name: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Es. Stanza Blu" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Capacità (Persone)</label>
                <input required type="number" min="1" value={roomData.capacity} onChange={e => setRoomData({...roomData, capacity: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descrizione</label>
                <input type="text" value={roomData.description} onChange={e => setRoomData({...roomData, description: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Es. Dotata di lavagna e giochi" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsRoomModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Annulla</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Salva Stanza</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
