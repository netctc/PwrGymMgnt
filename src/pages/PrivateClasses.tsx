import React, { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from 'date-fns';
import { AlertTriangle, Printer, Trash2, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
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
  const [classes, setClasses] = useState<PrivateClassSession[]>([]);
  const [members, setMembers] = useState<SchedulingPerson[]>([]);
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

  const isScheduler = hasClientPermission(profile?.role, 'scheduling.write');
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const fetchResources = async () => {
    const response = await schedulingApi.getResources();
    setMembers(response.members);
    setTrainers(response.trainers);
    setRooms(response.rooms);
    if (!room && response.rooms[0]) setRoom(response.rooms[0]);
  };

  const fetchPrivateClasses = async () => {
    setLoading(true);
    try {
      const response = await schedulingApi.listPrivateClasses({
        from: weekStart.toISOString(),
        to: addDays(weekStart, 7).toISOString(),
      });
      setClasses(response.privateClasses);
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
  }, [weekStart]);

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

    const member = members.find((item) => item.id === memberId);
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


  const handlePrintScheduledSessions = async () => {
    try {
      await reportsApi.downloadScheduledSessionsPdf('private-pt', {
        from: format(weekDays[0], 'yyyy-MM-dd'),
        to: format(weekDays[6], 'yyyy-MM-dd'),
        trainerId: printTrainerId,
      });
      toast.success('Scheduled private/PT sessions PDF generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate scheduled PT PDF');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full p-2">
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
                    {members.map((member) => <option key={member.id} value={member.id}>{fullName(member)}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
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

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button type="button" onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">Prev Week</button>
              <button type="button" onClick={() => setCurrentDate(new Date())} className="px-5 py-2 text-sm font-bold bg-white text-slate-900 rounded-md shadow-sm">Today</button>
              <button type="button" onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">Next Week</button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="text-lg font-bold text-slate-800 sm:pb-2">
                {format(weekDays[0], 'MMM d')} – {format(weekDays[6], 'MMM d, yyyy')}
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
          reportIds={['private-pt-sessions']}
          params={{ trainerId: printTrainerId }}
          title="Private PT screen PDFs"
          description="Generate private/PT session PDFs for the selected trainer and period."
          defaultFrom={format(weekDays[0], 'yyyy-MM-dd')}
          defaultTo={format(weekDays[6], 'yyyy-MM-dd')}
        />

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
      </div>
    </div>
  );
}
