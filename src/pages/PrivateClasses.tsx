import React, { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from 'date-fns';
import { AlertTriangle, Printer, Trash2, UserRoundCheck, Edit3, ToggleLeft, List, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import DateInput from '../components/DateInput';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { schedulingApi, SchedulingApiError, type PrivateClassSession, type SchedulingPerson } from '../lib/schedulingApi';
import { reportsApi } from '../lib/reportsApi';
import ScreenReportActions from '../components/ScreenReportActions';
import { hasClientPermission } from '../lib/permissions';

function fullName(person?: SchedulingPerson) {
  if (!person) return '';
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.email || person.id;
}

function errorMessage(error: unknown) {
  if (error instanceof SchedulingApiError && error.conflicts.length > 0) {
    const first = error.conflicts[0];
    const nested = first.conflicts?.[0];
    const reason = nested?.reason || first.reason;
    const date = first.date ? `${first.date}: ` : '';
    return `${date}${reason || error.message}`;
  }
  return error instanceof Error ? error.message : 'Operation failed';
}

const daysOfWeek = [
  { id: 1, label: 'Mo' },
  { id: 2, label: 'Tu' },
  { id: 3, label: 'We' },
  { id: 4, label: 'Th' },
  { id: 5, label: 'Fr' },
  { id: 6, label: 'Sa' },
  { id: 0, label: 'Su' },
];

export default function PrivateClasses() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const initialTodayFilter = searchParams.get('date') === 'today';
  const [classes, setClasses] = useState<PrivateClassSession[]>([]);
  const [members, setMembers] = useState<SchedulingPerson[]>([]);
  const [limitedMembers, setLimitedMembers] = useState<SchedulingPerson[]>([]);
  const [trainers, setTrainers] = useState<SchedulingPerson[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lastConflict, setLastConflict] = useState<string | null>(null);

  const [memberId, setMemberId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [room, setRoom] = useState('Personal Training Area');
  const [level, setLevel] = useState('Beginner');
  const [branch, setBranch] = useState('General');
  const [notes, setNotes] = useState('');
  const [printTrainerId, setPrintTrainerId] = useState('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>(
    searchParams.get('view') === 'list' ? 'list' : 'calendar',
  );
  const [listFrom, setListFrom] = useState(
    initialTodayFilter ? format(new Date(), 'yyyy-MM-dd') : '',
  );
  const [listTo, setListTo] = useState(
    initialTodayFilter ? format(new Date(), 'yyyy-MM-dd') : '',
  );
  const [listTrainerId, setListTrainerId] = useState('');
  const [listClassType, setListClassType] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(25);
  const [filterRevision, setFilterRevision] = useState(0);
  const [listPagination, setListPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });

  const isScheduler = hasClientPermission(profile?.role, 'scheduling.write');
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const fetchResources = async () => {
    const response = await schedulingApi.getResources();
    setMembers(response.members);
    setLimitedMembers(response.limitedMembers || []);
    setTrainers(response.trainers);
    setRooms(response.rooms);
    if (!room && response.rooms[0]) setRoom(response.rooms[0]);
  };

  const fetchPrivateClasses = async (audit = false, requestedPage = listPage) => {
    setLoading(true);
    try {
      const listFromDate = listFrom
        ? new Date(`${listFrom}T00:00:00`).toISOString()
        : undefined;
      const listToDate = listTo
        ? new Date(`${listTo}T23:59:59.999`).toISOString()
        : undefined;
      const response = await schedulingApi.listPrivateClasses({
        from: viewMode === 'calendar' ? weekStart.toISOString() : listFromDate,
        to:
          viewMode === 'calendar'
            ? addDays(weekStart, 7).toISOString()
            : listToDate,
        trainerId:
          viewMode === 'list' ? listTrainerId || undefined : undefined,
        classType:
          viewMode === 'list' ? listClassType || undefined : undefined,
        page: viewMode === 'list' ? requestedPage : 1,
        pageSize: viewMode === 'list' ? listPageSize : 200,
        audit,
      });
      setClasses(response.privateClasses);
      setListPagination(
        response.pagination || {
          page: 1,
          pageSize: response.privateClasses.length,
          total: response.privateClasses.length,
          totalPages: 1,
        },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources().catch((error) => toast.error(errorMessage(error)));
  }, []);

  useEffect(() => {
    fetchPrivateClasses();
  }, [weekStart, viewMode, listPage, listPageSize, filterRevision]);

  const toggleDay = (dayId: number) => {
    setSelectedDays((current) => current.includes(dayId) ? current.filter((item) => item !== dayId) : [...current, dayId]);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isScheduler) return;
    if (!memberId || !trainerId) {
      toast.error('Select both member and trainer');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('Select start and end dates');
      return;
    }
    if (selectedDays.length === 0) {
      toast.error('Select at least one day of week');
      return;
    }

    const member = limitedMembers.find((item) => item.id === memberId);
    const trainer = trainers.find((item) => item.id === trainerId);
    try {
      setLastConflict(null);
      const response = await schedulingApi.createPrivateClasses({
        memberId,
        memberName: fullName(member),
        trainerId,
        trainerName: fullName(trainer),
        startDate,
        endDate,
        selectedDays,
        startTime,
        durationMinutes: Number(duration),
        room,
        level,
        branch,
        notes,
      });
      toast.success(`${response.privateClasses.length} private session(s) scheduled`);
      setNotes('');
      await fetchPrivateClasses();
    } catch (error) {
      const message = errorMessage(error);
      setLastConflict(message);
      toast.error(message);
    }
  };

  const handleCancel = async (session: PrivateClassSession, scope: 'single' | 'series') => {
    if (!isScheduler) return;
    try {
      await schedulingApi.cancelPrivateClass(session.id, scope);
      toast.success(scope === 'series' ? 'Private session series cancelled' : 'Private session cancelled');
      await fetchPrivateClasses();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  // --- List/Management view state ---
  const [editingSession, setEditingSession] = useState<PrivateClassSession | null>(null);
  const [editForm, setEditForm] = useState({ memberId: '', trainerId: '', startTime: '', duration: '60', room: '', level: '', branch: '', notes: '' });

  const openEdit = (session: PrivateClassSession) => {
    setEditForm({
      memberId: session.memberId || '',
      trainerId: session.trainerId || '',
      startTime: session.startTime ? session.startTime.slice(0, 16) : '',
      duration: '60',
      room: session.room || '',
      level: session.level || '',
      branch: session.branch || '',
      notes: session.notes || '',
    });
    setEditingSession(session);
  };

  const handleUpdate = async () => {
    if (!editingSession) return;
    try {
      const member = members.find((m) => m.id === editForm.memberId);
      const trainer = trainers.find((t) => t.id === editForm.trainerId);
      await schedulingApi.updatePrivateClass(editingSession.id, {
        memberId: editForm.memberId,
        memberName: fullName(member),
        trainerId: editForm.trainerId,
        trainerName: fullName(trainer),
        startTime: new Date(editForm.startTime).toISOString(),
        durationMinutes: Number(editForm.duration),
        room: editForm.room,
        level: editForm.level,
        branch: editForm.branch,
        notes: editForm.notes,
      });
      toast.success('Private session updated');
      setEditingSession(null);
      await fetchPrivateClasses();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleDeactivate = async (session: PrivateClassSession) => {
    if (!isScheduler) return;
    try {
      await schedulingApi.updatePrivateClass(session.id, { status: 'inactive' });
      toast.success('Private session deactivated');
      await fetchPrivateClasses();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };


  const handlePrintScheduledSessions = async () => {
    try {
      await reportsApi.downloadScheduledSessionsPdf('private-pt', {
        from:
          viewMode === 'list' && listFrom
            ? listFrom
            : format(weekDays[0], 'yyyy-MM-dd'),
        to:
          viewMode === 'list' && listTo
            ? listTo
            : format(weekDays[6], 'yyyy-MM-dd'),
        trainerId:
          viewMode === 'list'
            ? listTrainerId || 'all'
            : printTrainerId,
      });
      toast.success('Scheduled private/PT sessions PDF generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate scheduled PT PDF');
    }
  };

  const applyListFilters = async (event: React.FormEvent) => {
    event.preventDefault();
    setListPage(1);
    await fetchPrivateClasses(true, 1);
  };

  const clearListFilters = () => {
    setListFrom('');
    setListTo('');
    setListTrainerId('');
    setListClassType('');
    setListPage(1);
    setFilterRevision((current) => current + 1);
  };

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    const limit = now + 48 * 60 * 60 * 1000;
    return classes.filter((session) => {
      const start = new Date(session.startTime).getTime();
      return (
        session.status === 'scheduled' &&
        Number.isFinite(start) &&
        start >= now &&
        start <= limit
      );
    }).length;
  }, [classes]);

  return (
    <div className="flex min-h-full flex-col items-start gap-6 p-2 lg:flex-row">
      {isScheduler && (
        <div className="w-full lg:w-[360px] shrink-0">
          <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <UserRoundCheck className="h-5 w-5 text-indigo-600" />
                Book Private Classes
              </h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Trainer</Label>
                  <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={trainerId} onChange={(event) => setTrainerId(event.target.value)} required>
                    <option value="">Select trainer</option>
                    {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{fullName(trainer)}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Member</Label>
                  <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={memberId} onChange={(event) => setMemberId(event.target.value)} required>
                    <option value="">Select member</option>
                    {limitedMembers.map((member) => <option key={member.id} value={member.id}>{fullName(member)}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <DateInput value={startDate} onChange={(v) => setStartDate(v)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <DateInput value={endDate} onChange={(v) => setEndDate(v)} required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Days of Week</Label>
                  <div className="flex gap-1 justify-between">
                    {daysOfWeek.map((day) => (
                      <button
                        type="button"
                        key={day.id}
                        onClick={() => toggleDay(day.id)}
                        className={`w-9 h-9 rounded-full text-xs font-bold transition-colors ${selectedDays.includes(day.id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Time</Label>
                    <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration</Label>
                    <Input type="number" min="15" value={duration} onChange={(event) => setDuration(event.target.value)} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Level</Label>
                    <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={level} onChange={(event) => setLevel(event.target.value)}>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
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
                  <Label>Notes</Label>
                  <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" />
                </div>

                {lastConflict && (
                  <div className="text-red-600 text-xs p-2 bg-red-50 rounded-md flex items-start gap-2 border border-red-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{lastConflict}</span>
                  </div>
                )}

                <Button type="submit" className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white">
                  Schedule Session(s)
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch">
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-1">
                <button type="button" onClick={() => setViewMode('calendar')} className={`px-3 py-2 text-sm font-medium rounded-md ${viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><CalendarDays className="h-4 w-4 inline mr-1" />Calendar</button>
                <button type="button" onClick={() => { setListPage(1); setViewMode('list'); }} className={`px-3 py-2 text-sm font-medium rounded-md ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><List className="h-4 w-4 inline mr-1" />List</button>
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
              {viewMode === 'calendar' && (
                <div className="text-lg font-bold text-slate-800 sm:pb-2">
                  {format(weekDays[0], 'dd/MM/yyyy')} – {format(weekDays[6], 'dd/MM/yyyy')}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                {viewMode === 'calendar' && <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Trainer</Label>
                  <select
                    className="h-9 min-w-[180px] rounded-md border border-slate-200 px-2 text-xs bg-white"
                    value={printTrainerId}
                    onChange={(event) => setPrintTrainerId(event.target.value)}
                  >
                    <option value="all">All trainers</option>
                    {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{fullName(trainer)}</option>)}
                  </select>
                </div>}
                <Button type="button" size="sm" variant="outline" onClick={handlePrintScheduledSessions} className="h-9">
                  <Printer className="h-3.5 w-3.5" /> Print Scheduled Session
                </Button>
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'list' && (
          <form
            onSubmit={applyListFilters}
            className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-6"
          >
            <div className="space-y-1">
              <Label htmlFor="privatePtFrom">From</Label>
              <DateInput id="privatePtFrom" value={listFrom} onChange={setListFrom} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="privatePtTo">To</Label>
              <DateInput id="privatePtTo" value={listTo} onChange={setListTo} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="privatePtTrainer">Trainer</Label>
              <select
                id="privatePtTrainer"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={listTrainerId}
                onChange={(event) => setListTrainerId(event.target.value)}
              >
                <option value="">All trainers</option>
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>{fullName(trainer)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="privatePtType">Class type / level</Label>
              <select
                id="privatePtType"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={listClassType}
                onChange={(event) => setListClassType(event.target.value)}
              >
                <option value="">All types</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="privatePtPageSize">Classes per page</Label>
              <select
                id="privatePtPageSize"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={listPageSize}
                onChange={(event) => {
                  setListPage(1);
                  setListPageSize(Number(event.target.value));
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={loading}>Apply</Button>
              <Button type="button" variant="outline" onClick={clearListFilters} disabled={loading}>Clear</Button>
            </div>
          </form>
        )}

        {upcomingSessions > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {upcomingSessions} scheduled Private PT {upcomingSessions === 1 ? 'class is' : 'classes are'} starting in the next 48 hours.
          </div>
        )}

        <ScreenReportActions
          compact
          reportIds={['private-pt-sessions']}
          params={{
            trainerId:
              viewMode === 'list' ? listTrainerId || 'all' : printTrainerId,
            classType: viewMode === 'list' ? listClassType : undefined,
          }}
          title="Private PT screen PDFs"
          description="Generate private/PT session PDFs for the selected trainer and period."
          defaultFrom={
            viewMode === 'list' && listFrom
              ? listFrom
              : format(weekDays[0], 'yyyy-MM-dd')
          }
          defaultTo={
            viewMode === 'list' && listTo
              ? listTo
              : format(weekDays[6], 'yyyy-MM-dd')
          }
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
                    <p className="text-sm text-slate-400">No private sessions</p>
                  ) : (
                    <div className="space-y-3">
                      {dayClasses.map((session) => (
                        <div key={session.id} className="rounded-xl border border-slate-100 p-3 shadow-sm bg-indigo-50/50">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-bold text-slate-900 text-sm">{session.memberName || session.memberId}</h3>
                              <p className="text-xs text-slate-500">
                                {format(new Date(session.startTime), 'hh:mm a')} - {format(new Date(session.endTime), 'hh:mm a')}
                              </p>
                            </div>
                            <Badge variant={session.status === 'cancelled' ? 'destructive' : 'secondary'}>{session.status}</Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">Trainer: {session.trainerName || session.trainerId}</p>
                          <p className="text-xs text-slate-500">{session.level} • {session.room}</p>
                          {session.notes && <p className="text-xs text-slate-500 mt-1">{session.notes}</p>}

                          {isScheduler && session.status !== 'cancelled' && (
                            <div className="mt-3 flex gap-2">
                              <Button type="button" size="sm" variant="destructive" onClick={() => handleCancel(session, 'single')}>
                                <Trash2 className="h-3.5 w-3.5" /> Cancel
                              </Button>
                              {session.seriesId && (
                                <Button type="button" size="sm" variant="outline" onClick={() => handleCancel(session, 'series')}>
                                  Cancel Series
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}

        {viewMode === 'list' && (
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="max-h-[70vh] overflow-auto [scrollbar-gutter:stable]">
            <table className="w-full min-w-[1320px] text-sm">
              <thead className="sticky top-0 z-10 border-b bg-slate-50 shadow-sm">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Member</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Trainer</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Date & Time</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Duration</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Room</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Level</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Branch</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Notes</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
                ) : classes.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No private sessions match the selected filters</td></tr>
                ) : (
                  classes.map((session) => (
                    <tr key={session.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{session.memberName || session.memberId}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{session.trainerName || session.trainerId}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {session.startTime && format(new Date(session.startTime), 'EEE, dd/MM/yyyy')}
                        <br />
                        <span className="text-xs text-slate-500">{session.startTime && format(new Date(session.startTime), 'hh:mm a')} – {session.endTime && format(new Date(session.endTime), 'hh:mm a')}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">
                        {session.startTime && session.endTime
                          ? `${Math.max(0, Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000))} min`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{session.room}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{session.level}</td>
                      <td className="px-4 py-3 text-slate-700">{session.branch || '—'}</td>
                      <td className="max-w-[260px] whitespace-normal px-4 py-3 text-slate-600">{session.notes || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={session.status === 'cancelled' ? 'destructive' : session.status === 'inactive' ? 'outline' : 'secondary'}>{session.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isScheduler && session.status !== 'cancelled' && (
                            <>
                              <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(session)} title="Edit"><Edit3 className="h-4 w-4" /></Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => handleDeactivate(session)} title="Deactivate"><ToggleLeft className="h-4 w-4" /></Button>
                              <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleCancel(session, 'single')} title="Cancel"><Trash2 className="h-4 w-4" /></Button>
                              {session.seriesId && (
                                <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleCancel(session, 'series')} title="Cancel Series">Series</Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {listPagination.total === 0
                  ? 'No classes'
                  : `Showing ${(listPagination.page - 1) * listPagination.pageSize + 1}–${Math.min(listPagination.page * listPagination.pageSize, listPagination.total)} of ${listPagination.total} classes`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || listPagination.page <= 1}
                  onClick={() => setListPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <span>Page {listPagination.page} of {listPagination.totalPages}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || listPagination.page >= listPagination.totalPages}
                  onClick={() => setListPage((page) => Math.min(listPagination.totalPages, page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Private Session Modal */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingSession(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Edit Private Session</h3>
            <div className="space-y-3">
              <div><Label>Member</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.memberId} onChange={(e) => setEditForm({ ...editForm, memberId: e.target.value })}><option value="">Select member</option>{members.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</select></div>
              <div><Label>Trainer</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.trainerId} onChange={(e) => setEditForm({ ...editForm, trainerId: e.target.value })}><option value="">Select trainer</option>{trainers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Time</Label><Input type="datetime-local" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })} /></div>
                <div><Label>Duration (min)</Label><Input type="number" value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Level</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.level} onChange={(e) => setEditForm({ ...editForm, level: e.target.value })}><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></div>
                <div><Label>Room</Label><select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editForm.room} onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}>{rooms.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
              <div><Label>Notes</Label><Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Optional notes" /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleUpdate}>Save Changes</Button>
              <Button variant="outline" onClick={() => setEditingSession(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
