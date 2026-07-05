import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Mail, Phone, ExternalLink, HeadphonesIcon, HelpCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { engagementApi, type SupportTicket } from '../lib/engagementApi';
import { useAuth } from '../contexts/AuthContext';
import ScreenReportActions from '../components/ScreenReportActions';

function statusVariant(status: string) {
  if (['resolved', 'closed'].includes(status)) return 'secondary' as const;
  if (['urgent', 'escalated'].includes(status)) return 'destructive' as const;
  return 'outline' as const;
}

export default function Support() {
  const { user, profile } = useAuth();
  const [formData, setFormData] = useState({
    name: profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : '',
    email: user?.email || profile?.email || '',
    phone: profile?.phone || '',
    type: 'technical',
    priority: 'normal',
    subject: '',
    description: '',
  });
  const [channels, setChannels] = useState({
    email: 'assaf@gmail.com',
    phone: '+96179107040',
    whatsapp: '+96179107040',
    officeHours: 'Mon - Fri: 9:00 AM - 6:00 PM',
  });
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);

  const whatsappUrl = useMemo(() => `https://wa.me/${channels.whatsapp.replace(/[^0-9]/g, '')}`, [channels.whatsapp]);

  const loadTickets = async () => {
    setTicketLoading(true);
    try {
      const [channelResponse, ticketResponse] = await Promise.all([
        engagementApi.getContactChannels(),
        engagementApi.listSupportTickets(),
      ]);
      setChannels(channelResponse.channels);
      setTickets(ticketResponse.tickets);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load support information.');
    } finally {
      setTicketLoading(false);
    }
  };

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      name: current.name || (profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : ''),
      email: current.email || user?.email || profile?.email || '',
      phone: current.phone || profile?.phone || '',
    }));
  }, [profile, user?.email]);

  useEffect(() => {
    loadTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.description) {
      toast.error('Please fill out all required fields.');
      return;
    }

    setLoading(true);
    try {
      const response = await engagementApi.createSupportTicket(formData);
      setTickets((current) => [response.ticket, ...current]);
      toast.success(`Support ticket ${response.ticket.ticketNumber} created successfully.`);
      setFormData((current) => ({
        ...current,
        type: 'technical',
        priority: 'normal',
        subject: '',
        description: '',
      }));
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while submitting your request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Support & Contact</h2>
          <p className="text-slate-500 mt-2">Create support tickets, track responses, and contact Assaf IT Consulting & Support.</p>
        </div>
        <Button variant="outline" onClick={loadTickets} disabled={ticketLoading} className="w-full sm:w-auto">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <ScreenReportActions
        reportIds={['support-tickets', 'notifications']}
        title="Support screen PDFs"
        description="Download support ticket and notification reports from this screen."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                Create Support Ticket
              </CardTitle>
              <CardDescription>
                Requests are now saved as structured tickets and notify the admin team in-app.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type *</Label>
                    <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technical">Technical Support</SelectItem>
                        <SelectItem value="commercial">Commercial Inquiry</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="feature">Feature Request</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={formData.priority} onValueChange={(val) => setFormData({ ...formData, priority: val })}>
                      <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="Short issue summary" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea id="description" placeholder="Provide details about your inquiry..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required />
                </div>

                <Button type="submit" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Support Request'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                Recent Tickets
              </CardTitle>
              <CardDescription>Track recent support and commercial requests.</CardDescription>
            </CardHeader>
            <CardContent>
              {tickets.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                  {ticketLoading ? 'Loading tickets...' : 'No support tickets yet.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-lg border bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">{ticket.ticketNumber}</p>
                            <Badge variant={statusVariant(ticket.status)}>{ticket.status}</Badge>
                            <Badge variant="outline">{ticket.priority}</Badge>
                          </div>
                          <p className="text-sm text-slate-700 mt-1">{ticket.subject}</p>
                          <p className="text-xs text-slate-500 mt-1">{ticket.requesterEmail} • {new Date(ticket.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-slate-50 border-b pb-4">
              <CardTitle className="text-lg">Company Info</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900 text-base mb-2">Assaf IT Consulting & Support</p>
              <p className="leading-relaxed">
                We specialize in transforming your ideas into reliable, scalable, and future-ready systems.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-slate-50 border-b pb-4">
              <CardTitle className="text-lg">Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6 text-sm text-slate-600">
              <div className="flex items-start space-x-3">
                <Mail className="w-5 h-5 text-indigo-500 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Email</p>
                  <a href={`mailto:${channels.email}`} className="hover:text-indigo-600 transition-colors">{channels.email}</a>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Phone className="w-5 h-5 text-indigo-500 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Phone & WhatsApp</p>
                  <a href={`tel:${channels.phone}`} className="hover:text-indigo-600 transition-colors block">{channels.phone}</a>
                  <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center text-xs text-emerald-600 font-medium hover:underline mt-1">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Chat on WhatsApp
                  </a>
                </div>
              </div>

              <div className="flex items-start space-x-3 pt-4 border-t border-slate-100">
                <HeadphonesIcon className="w-5 h-5 text-indigo-500 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Office Hours</p>
                  <p>{channels.officeHours}</p>
                  <p className="text-xs text-slate-500 mt-1">Expected response: within 2 business hours</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
