import React, { useEffect, useMemo, useState } from 'react';
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { CalendarDays, Printer, Trash2, UserPlus, Edit3, Users, ToggleLeft, List } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { schedulingApi, SchedulingApiError, type ClassSession, type SchedulingPerson } from '../lib/schedulingApi';
import { reportsApi } from '../lib/reportsApi';
import ScreenReportActions from '../components/ScreenReportActions';
import ListPagination from '../components/ListPagination';
import { hasClientPermission } from '../lib/permissions';

function fullName(person?: SchedulingPerson) {
  if (!person) return '';
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.email || person.id;
}

function formatConflictMessage(error: unknown) {
  if (error instanceof SchedulingApiError && error.conflicts.length > 0) {
    const first = error.conflicts[0];
    if (first.conflicts?.length) return first.conflicts[0].reason || error.message;
    return first.reason || error.message;
  }
  return error instanceof Error ? error.message : 'Operation failed';
}

export default function Classes() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [members, setMembers] = useState<SchedulingPerson[]>([]);
  const [trainers, setTrainers] = useState<SchedulingPerson[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookingMemberByClass, setBookingMemberByClass] = useState<Record<string, string>>({});

  const [title, setTitle] = useState('');
  const [type, setType] = useState('HIIT');
  const [capacity, setCapacity] = useState('12');
  const [room, setRoom] = useState('Main Studio');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('60');
  const [level, setLevel] = useState('General');
  const [branch, setBranch] = useState('General');
  const [trainerId, setTrainerId] = useState('');
  const [printTrainerId, setPrintTrainerId] = useState('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [listFrom, setListFrom] = useState('');
  const [listTo, setListTo] = useState('');
  const [listType, setListType] = useState('all');
  const [listTrainerId, setListTrainerId] = useState('all');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(25);

  const isScheduler = hasClientPermission(profile?.role, 'scheduling.write');
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const fetchResources = async () => {
    const resourceResponse = await schedulingApi.getResources();
    setMembers(resourceResponse.members);
    setTrainers(resourceResponse.trainers);
    setRooms(resourceResponse.rooms);
    if (!room && resourceResponse.rooms[0]) setRoom(resourceResponse.rooms[0]);
  };

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const response = viewMode === 'calendar'
        ? await schedulingApi.listClasses({ from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString() })
        : await schedulingApi.listClasses({
            from: listFrom ? new Date(`${listFrom}T00:00:00`).toISOString() : undefined,
            to: listTo ? new Date(`${listTo}T23:59:59.999`).toISOString() : undefined,
            trainerId: listTrainerId === 'all' ? undefined : listTrainerId,
            type: listType === 'all' ? undefined : listType,
          });
      setClasses(response.classes);
    } catch (error) {
      toast.error(formatConflictMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources().catch((error) => toast.error(formatConflictMessage(error)));
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [weekStart, viewMode, listFrom, listTo, listType, listTrainerId]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isScheduler) return;
    if (!startTime) {
      toast.error('Please select a start time');
      return;
    }

    const selectedTrainer = trainers.find((trainer) => trainer.id === trainerId);
    try {
      await schedulingApi.createClass({
        title,
        trainerId,
        trainerName: fullName(selectedTrainer),
        capacity: Number(capacity),
        startTime: new Date(startTime).toISOString(),
        durationMinutes: Number(duration),
        room,
        type,
        level,
        branch,
      });
      toast.success('Class created successfully');
      setTitle('');
      setStartTime('');
      await fetchClasses();
    } catch (error) {
      toast.error(formatConflictMessage(error));
    }
  };

  const handleCancelClass = async (classId: string) => {
    if (!isScheduler) return;
    try {
      await schedulingApi.cancelClass(classId);
      toast.success('Class cancelled');
      await fetchClasses();
    } catch (error) {
      toast.error(formatConflictMessage(error));
    }
  };

  const handleBookMember = async (classSession: ClassSession) => {
    if (!isScheduler) return;
    const memberId = bookingMemberByClass[classSession.id];
    if (!memberId) {
      toast.error('Select a member first');
      return;
    }
    const member = members.find((item) => item.id === memberId);
    try {
      await schedulingApi.createBooking(classSession.id, {
        memberId,
        memberName: fullName(member),
      });
      toast.success('Member booked successfully');
      setBookingMemberByClass((current) => ({ ...current, [classSession.id]: '' }));
      await fetchClasses();
    } catch (error) {
      toast.error(formatConflictMessage(error));
    }
  };


  const handlePrintScheduledSessions = async () => {
    try {
      await reportsApi.downloadScheduledSessionsPdf('classes', {
        from: format(weekDays[0], 'yyyy-MM-dd'),
        to: format(weekDays[6], 'yyyy-MM-dd'),
        trainerId: printTrainerId,
      });
      toast.success('Scheduled classes PDF generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate scheduled classes PDF');
    }
  };

  const handlePrintSingleClass = async (classSession: ClassSession) => {
    try {
      await reportsApi.downloadClassSessionPdf(classSession.id);
      toast.success('Class PDF generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate class PDF');
    }
  };

  // --- List/Management view state ---
  const [editingClass, setEditingClass] = useState<ClassSession | null>(null);
  const [editForm, setEditForm] = useState({ title: '', type: '', capacity: '', room: '', level: '', branch: '', trainerId: '', startTime: '', duration: '60' });
  const [participantsClass, setParticipantsClass] = useState<ClassSession | null>(null);
  const [bookings, setBookings] = useState<Array<{ id: string; memberId: string; memberName?: string; status: string; bookedAt?: string }>>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const classTotalPages = Math.max(1, Math.ceil(classes.length / listPageSize));
  const safeListPage = Math.min(listPage, classTotalPages);
  const pagedClasses = classes.slice((safeListPage - 1) * listPageSize, safeListPage * listPageSize);

  useEffect(() => { setListPage(1); }, [listFrom, listTo, listType, listTrainerId, listPageSize]);

  const openEdit = (classSession: ClassSession) => {
    setEditForm({
      title: classSession.title || '',
      type: classSession.type || '',
      capacity: String(classSession.capacity || 12),
      room: classSession.room || '',
      level: classSession.level || '',
      branch: classSession.branch || '',
      trainerId: classSession.trainerId || '',
      startTime: classSession.startTime ? classSession.startTime.slice(0, 16) : '',
      duration: '60',
    });
    setEditingClass(classSession);
  };

  const handleUpdate = async () => {
    if (!editingClass) return;
    try {
      const selectedTrainer = trainers.find((t) => t.id === editForm.trainerId);
      await schedulingApi.updateClass(editingClass.id, {
        title: editForm.title,
        type: editForm.type,
        capacity: Number(editForm.capacity),
        room: editForm.room,
        level: editForm.level,
        branch: editForm.branch,
        trainerId: editForm.trainerId,
        trainerName: fullName(selectedTrainer),
        startTime: new Date(editForm.startTime).toISOString(),
        durationMinutes: Number(editForm.duration),
      });
      toast.success('Class updated');
      setEditingClass(null);
      await fetchClasses();
    } catch (error) {
      toast.error(formatConflictMessage(error));
    }
  };

  const handleDeactivate = async (classSession: ClassSession) => {
    if (!isScheduler) return;
    try {
      await schedulingApi.updateClass(classSession.id, { status: 'inactive' });
      toast.success('Class deactivated');
      await fetchClasses();
    } catch (error) {
      toast.error(formatConflictMessage(error));
    }
  };

  const openParticipants = async (classSession: ClassSession) => {
    setParticipantsClass(classSession);
    setBookingsLoading(true);
    try {
      const response = await schedulingApi.listBookings(classSession.id);
      setBookings(response.bookings);
    } catch (error) {
      toast.error(formatConflictMessage(error));
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      await schedulingApi.cancelBooking(bookingId);
      toast.success('Booking cancelled');
      if (participantsClass) await openParticipants(participantsClass);
      await fetchClasses();
    } catch (error) {
      toast.error(formatConflictMessage(error));
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full p-2">
      {isScheduler && (
        <div className="w-full lg:w-[340px] shrink-0">
          <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-green-600" />
                New Group Class
              </h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Morning HIIT" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
                      <option value="HIIT">HIIT</option>
                      <option value="Yoga">Yoga</option>
                      <option value="Crossfit">Crossfit</option>
                      <option value="Spinning">Spinning</option>
                      <option value="Strength">Strength</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Level</Label>
                    <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={level} onChange={(event) => setLevel(event.target.value)}>
                      <option value="General">General</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Time</Label>
                    <Input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration</Label>
                    <Input type="number" min="15" value={duration} onChange={(event) => setDuration(event.target.value)} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Capacity</Label>
                    <Input type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch</Label>
                    <Input value={branch} onChange={(event) => setBranch(event.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Room</Label>
                  <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={room} onChange={(event) => setRoom(event.target.value)}>
                    {rooms.map((roomName) => <option key={roomName} value={roomName}>{roomName}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Trainer</Label>
                  <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={trainerId} onChange={(event) => setTrainerId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{fullName(trainer)}</option>)}
                  </select>
                </div>

                <Button type="submit" className="w-full h-11 bg-green-600 hover:bg-green-700 text-white">
                  Create Class
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-1">
                <button type="button" onClick={() => setViewMode('calendar')} className={`px-3 py-2 text-sm font-medium rounded-md ${viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><CalendarDays className="h-4 w-4 inline mr-1" />Calendar</button>
                <button type="button" onClick={() => setViewMode('list')} className={`px-3 py-2 text-sm font-medium rounded-md ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><List className="h-4 w-4 inline mr-1" />List</button>
              </div>
              {viewMode === 'calendar' && (
                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                  <button type="button" onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">Prev Week</button>
                  <button type="button" onClick={() => setCurrentDate(new Date())} className="px-5 py-2 text-sm font-bold bg-white text-slate-900 rounded-md shadow-sm">Today</button>
                  <button type="button" onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">Next Week</button>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="text-lg font-bold text-slate-800 sm:pb-2">
                {format(weekDays[0], 'dd/MM/yyyy')} – {format(weekDays[6], 'dd/MM/yyyy')}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Trainer</Label>
                  <select
                    className="h-9 min-w-[180px] rounded-md border border-slate-200 px-2 text-xs bg-white"
                    value={printTrainerId}
                    onChange={(event) => setPrintTrainerId(event.target.value)}
                  >
                    <option value="all">All trainers</option>
                    {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{fullName(trainer)}</option>)}
                  </select>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={handlePrintScheduledSessions} className="h-9">
                  <Printer className="h-3.5 w-3.5" /> Print Scheduled Session
                </Button>
              </div>
            </div>
          </div>
        </div>

        <ScreenReportActions
          compact
          reportIds={['class-sessions', 'class-bookings']}
          params={{ trainerId: printTrainerId }}
          title="Class screen PDFs"
          description="Generate class sessions and booking PDFs for the selected trainer and period."
          defaultFrom={format(weekDays[0], 'yyyy-MM-dd')}
          defaultTo={format(weekDays[6], 'yyyy-MM-dd')}
        />

        {viewMode === 'calendar' && (
        <div className="grid grid-cols-1 xl:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayClasses = classes.filter((item) => item.startTime && isSameDay(new Date(item.startTime), day));
            return (
              <Card key={day.toISOString()} className="min-h-[420px] border border-slate-100 bg-white rounded-2xl">
                <CardContent className="p-4">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">{format(day, 'EEE')}</p>
                    <p className="text-2xl font-bold text-slate-900">{format(day, 'dd')}</p>
                  </div>

                  {loading ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                  ) : dayClasses.length === 0 ? (
                    <p className="text-sm text-slate-400">No classes</p>
                  ) : (
                    <div className="space-y-3">
                      {dayClasses.map((classSession) => {
                        const freeSpots = classSession.capacity - classSession.enrolledCount;
                        const full = freeSpots <= 0;
                        return (
                          <div key={classSession.id} className="rounded-xl border border-slate-100 p-3 shadow-sm bg-slate-50/60">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-bold text-slate-900 text-sm">{classSession.title}</h3>
                                <p className="text-xs text-slate-500">
                                  {format(new Date(classSession.startTime), 'hh:mm a')} - {format(new Date(classSession.endTime), 'hh:mm a')}
                                </p>
                              </div>
                              <Badge variant={full ? 'destructive' : 'secondary'}>{full ? 'Full' : `${freeSpots} left`}</Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">{classSession.type} • {classSession.level} • {classSession.room}</p>
                            <p className="text-xs text-slate-500">Trainer: {classSession.trainerName || classSession.trainerId || 'Unassigned'}</p>
                            <Button type="button" size="sm" variant="outline" className="mt-3 w-full text-xs" onClick={() => handlePrintSingleClass(classSession)}>
                              <Printer className="h-3.5 w-3.5" /> Print Class
                            </Button>

                            {isScheduler && classSession.status !== 'cancelled' && (
                              <div className="mt-3 space-y-2">
                                <select className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs" value={bookingMemberByClass[classSession.id] || ''} onChange={(event) => setBookingMemberByClass((current) => ({ ...current, [classSession.id]: event.target.value }))} disabled={full}>
                                  <option value="">Book member</option>
                                  {members.map((member) => <option key={member.id} value={member.id}>{fullName(member)}</option>)}
                                </select>
                                <div className="flex gap-2">
                                  <Button type="button" size="sm" className="flex-1" onClick={() => handleBookMember(classSession)} disabled={full}><UserPlus className="h-3.5 w-3.5" /> Book</Button>
                                  <Button type="button" size="sm" variant="destructive" onClick={() => handleCancelClass(classSession.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}

        {viewMode === 'list' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <div><Label className="text-xs text-slate-500">From</Label><Input type="date" value={listFrom} onChange={(event) => setListFrom(event.target.value)} /></div>
              <div><Label className="text-xs text-slate-500">To</Label><Input type="date" value={listTo} onChange={(event) => setListTo(event.target.value)} /></div>
              <div><Label className="text-xs text-slate-500">Class type</Label><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={listType} onChange={(event) => setListType(event.target.value)}><option value="all">All types</option><option value="HIIT">HIIT</option><option value="Yoga">Yoga</option><option value="Crossfit">Crossfit</option><option value="Spinning">Spinning</option><option value="Strength">Strength</option></select></div>
              <div><Label className="text-xs text-slate-500">Trainer</Label><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={listTrainerId} onChange={(event) => setListTrainerId(event.target.value)}><option value="all">All trainers</option>{trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{fullName(trainer)}</option>)}</select></div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Class</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Date & Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Trainer</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Room</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Capacity</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
                ) : classes.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No classes found for this week</td></tr>
                ) : (
                  pagedClasses.map((classSession) => {
                    const freeSpots = classSession.capacity - classSession.enrolledCount;
                    return (
                      <tr key={classSession.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{classSession.title}</p>
                          <p className="text-xs text-slate-500">{classSession.type} • {classSession.level}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {classSession.startTime && format(new Date(classSession.startTime), 'EEE, dd/MM/yyyy')}
                          <br />
                          <span className="text-xs text-slate-500">{classSession.startTime && format(new Date(classSession.startTime), 'hh:mm a')} – {classSession.endTime && format(new Date(classSession.endTime), 'hh:mm a')}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{classSession.trainerName || classSession.trainerId || 'Unassigned'}</td>
                        <td className="px-4 py-3 text-slate-700">{classSession.room}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold ${freeSpots <= 0 ? 'text-red-600' : 'text-green-600'}`}>{classSession.enrolledCount}/{classSession.capacity}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={classSession.status === 'cancelled' ? 'destructive' : classSession.status === 'inactive' ? 'outline' : 'secondary'}>{classSession.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button type="button" size="sm" variant="ghost" onClick={() => openParticipants(classSession)} title="View Participants"><Users className="h-4 w-4" /></Button>
                            {isScheduler && classSession.status !== 'cancelled' && (
                              <>
                                <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(classSession)} title="Edit"><Edit3 className="h-4 w-4" /></Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => handleDeactivate(classSession)} title="Deactivate"><ToggleLeft className="h-4 w-4" /></Button>
                                <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleCancelClass(classSession.id)} title="Cancel"><Trash2 className="h-4 w-4" /></Button>
                              </>
                            )}
                            <Button type="button" size="sm" variant="ghost" onClick={() => handlePrintSingleClass(classSession)} title="Print PDF"><Printer className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
            {!loading && classes.length > 0 && <ListPagination page={safeListPage} pageSize={listPageSize} total={classes.length} onPageChange={setListPage} onPageSizeChange={setListPageSize} />}
          </div>
        )}
      </div>

      {/* Edit Class Modal */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingClass(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Edit Class: {editingClass.title}</h3>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}><option value="HIIT">HIIT</option><option value="Yoga">Yoga</option><option value="Crossfit">Crossfit</option><option value="Spinning">Spinning</option><option value="Strength">Strength</option></select></div>
                <div><Label>Level</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.level} onChange={(e) => setEditForm({ ...editForm, level: e.target.value })}><option value="General">General</option><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Time</Label><Input type="datetime-local" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })} /></div>
                <div><Label>Duration (min)</Label><Input type="number" value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Capacity</Label><Input type="number" value={editForm.capacity} onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })} /></div>
                <div><Label>Room</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.room} onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}>{rooms.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
              <div><Label>Trainer</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.trainerId} onChange={(e) => setEditForm({ ...editForm, trainerId: e.target.value })}><option value="">Unassigned</option>{trainers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}</select></div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleUpdate}>Save Changes</Button>
              <Button variant="outline" onClick={() => setEditingClass(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Participants Modal */}
      {participantsClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setParticipantsClass(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Participants: {participantsClass.title}</h3>
            <p className="text-sm text-slate-500 mb-4">{participantsClass.enrolledCount} / {participantsClass.capacity} enrolled</p>
            {bookingsLoading ? (
              <p className="text-sm text-slate-500">Loading participants...</p>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-slate-400">No participants booked yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b"><tr><th className="text-left px-3 py-2">Member</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Booked At</th><th className="text-right px-3 py-2">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="px-3 py-2 font-medium">{booking.memberName || booking.memberId}</td>
                      <td className="px-3 py-2"><Badge variant={booking.status === 'cancelled' ? 'destructive' : 'secondary'}>{booking.status}</Badge></td>
                      <td className="px-3 py-2 text-slate-500">{booking.bookedAt ? format(new Date(booking.bookedAt), 'dd/MM/yyyy, hh:mm a') : '-'}</td>
                      <td className="px-3 py-2 text-right">
                        {isScheduler && booking.status === 'booked' && (
                          <Button type="button" size="sm" variant="ghost" className="text-red-500" onClick={() => handleCancelBooking(booking.id)}>Cancel</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Button variant="outline" className="mt-4 w-full" onClick={() => setParticipantsClass(null)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}
