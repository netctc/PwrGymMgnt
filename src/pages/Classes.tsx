import React, { useEffect, useMemo, useState } from 'react';
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { CalendarDays, Printer, Trash2, UserPlus } from 'lucide-react';
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
      const from = weekStart.toISOString();
      const to = addDays(weekStart, 7).toISOString();
      const response = await schedulingApi.listClasses({ from, to });
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
  }, [weekStart]);

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
          reportIds={['class-sessions', 'class-bookings']}
          params={{ trainerId: printTrainerId }}
          title="Class screen PDFs"
          description="Generate class sessions and booking PDFs for the selected trainer and period."
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
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3 w-full text-xs"
                              onClick={() => handlePrintSingleClass(classSession)}
                            >
                              <Printer className="h-3.5 w-3.5" /> Print Class
                            </Button>

                            {isScheduler && classSession.status !== 'cancelled' && (
                              <div className="mt-3 space-y-2">
                                <select
                                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                                  value={bookingMemberByClass[classSession.id] || ''}
                                  onChange={(event) => setBookingMemberByClass((current) => ({ ...current, [classSession.id]: event.target.value }))}
                                  disabled={full}
                                >
                                  <option value="">Book member</option>
                                  {members.map((member) => <option key={member.id} value={member.id}>{fullName(member)}</option>)}
                                </select>
                                <div className="flex gap-2">
                                  <Button type="button" size="sm" className="flex-1" onClick={() => handleBookMember(classSession)} disabled={full}>
                                    <UserPlus className="h-3.5 w-3.5" /> Book
                                  </Button>
                                  <Button type="button" size="sm" variant="destructive" onClick={() => handleCancelClass(classSession.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
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
      </div>
    </div>
  );
}
