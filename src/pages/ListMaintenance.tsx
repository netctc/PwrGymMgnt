import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useLocalization } from '../contexts/LocalizationContext';
import { planManagementApi, type LocalizedListItem, type MaintenanceList } from '../lib/planManagementApi';

const copy = {
  en: {
    title: 'List maintenance', subtitle: 'Manage database-backed values and their English/Arabic labels.',
    back: 'Settings', refresh: 'Refresh', add: 'Add value', code: 'Code', english: 'English label',
    arabic: 'Arabic label', order: 'Order', status: 'Status', actions: 'Actions', edit: 'Edit',
    delete: 'Delete', save: 'Save', cancel: 'Cancel', active: 'Active', inactive: 'Inactive',
    system: 'System', createTitle: 'Add list value', editTitle: 'Edit list value',
  },
  ar: {
    title: 'صيانة القوائم', subtitle: 'إدارة القيم المخزنة في قاعدة البيانات وتسمياتها بالإنجليزية والعربية.',
    back: 'الإعدادات', refresh: 'تحديث', add: 'إضافة قيمة', code: 'الرمز', english: 'التسمية بالإنجليزية',
    arabic: 'التسمية بالعربية', order: 'الترتيب', status: 'الحالة', actions: 'الإجراءات', edit: 'تعديل',
    delete: 'حذف', save: 'حفظ', cancel: 'إلغاء', active: 'نشط', inactive: 'غير نشط',
    system: 'نظام', createTitle: 'إضافة قيمة للقائمة', editTitle: 'تعديل قيمة القائمة',
  },
} as const;

type Form = { id: string; code: string; labelEn: string; labelAr: string; sortOrder: string; status: string };
const empty: Form = { id: '', code: '', labelEn: '', labelAr: '', sortOrder: '0', status: 'active' };

export default function ListMaintenance() {
  const { locale } = useLocalization();
  const c = locale === 'ar' ? copy.ar : copy.en;
  const [lists, setLists] = useState<MaintenanceList[]>([]);
  const [selected, setSelected] = useState('');
  const [form, setForm] = useState<Form>(empty);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const response = await planManagementApi.listMaintenance();
      setLists(response.lists);
      setSelected((current) => current || response.lists[0]?.id || '');
    } catch (error: any) { toast.error(error?.message || 'Unable to load lists'); }
  };
  useEffect(() => { load(); }, []);

  const edit = (item?: LocalizedListItem) => {
    setForm(item ? {
      id: item.id, code: item.code, labelEn: item.labelEn, labelAr: item.labelAr,
      sortOrder: String(item.sortOrder), status: item.status,
    } : empty);
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = { ...form, sortOrder: Number(form.sortOrder) };
      if (form.id) await planManagementApi.updateListItem(selected, form.id, payload);
      else await planManagementApi.addListItem(selected, payload);
      setOpen(false);
      await load();
      toast.success(c.save);
    } catch (error: any) { toast.error(error?.message || 'Unable to save value'); }
  };

  const remove = async (item: LocalizedListItem) => {
    try {
      await planManagementApi.deleteListItem(selected, item.id);
      await load();
      toast.success(c.delete);
    } catch (error: any) { toast.error(error?.message || 'Unable to delete value'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-3xl font-bold text-slate-900">{c.title}</h1><p className="text-sm text-slate-500">{c.subtitle}</p></div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/settings"><ArrowLeft className="me-2 h-4 w-4" />{c.back}</Link></Button>
          <Button variant="outline" onClick={load}><RefreshCw className="me-2 h-4 w-4" />{c.refresh}</Button>
        </div>
      </div>
      <Tabs value={selected} onValueChange={setSelected}>
        <TabsList className="h-auto flex-wrap justify-start">
          {lists.map((list) => <TabsTrigger key={list.id} value={list.id}>{locale === 'ar' ? list.nameAr : list.nameEn}</TabsTrigger>)}
        </TabsList>
        {lists.map((list) => (
          <TabsContent key={list.id} value={list.id}>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div><CardTitle>{locale === 'ar' ? list.nameAr : list.nameEn}</CardTitle><CardDescription>{locale === 'ar' ? list.descriptionAr : list.descriptionEn}</CardDescription></div>
                <Button onClick={() => edit()}><Plus className="me-2 h-4 w-4" />{c.add}</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>{c.code}</TableHead><TableHead>{c.english}</TableHead><TableHead>{c.arabic}</TableHead><TableHead>{c.order}</TableHead><TableHead>{c.status}</TableHead><TableHead className="text-end">{c.actions}</TableHead></TableRow></TableHeader>
                  <TableBody>{list.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.code}</TableCell><TableCell>{item.labelEn}</TableCell>
                      <TableCell dir="rtl">{item.labelAr}</TableCell><TableCell>{item.sortOrder}</TableCell>
                      <TableCell><div className="flex gap-1"><Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{item.status === 'active' ? c.active : c.inactive}</Badge>{item.isSystem && <Badge variant="outline">{c.system}</Badge>}</div></TableCell>
                      <TableCell className="text-end"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => edit(item)}><Pencil className="me-1 h-3.5 w-3.5" />{c.edit}</Button>{!item.isSystem && <Button size="sm" variant="destructive" onClick={() => remove(item)}><Trash2 className="me-1 h-3.5 w-3.5" />{c.delete}</Button>}</div></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? c.editTitle : c.createTitle}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label>{c.code}</Label><Input disabled={Boolean(form.id)} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></div>
            <div className="space-y-2"><Label>{c.english}</Label><Input value={form.labelEn} onChange={(e) => setForm({ ...form, labelEn: e.target.value })} required /></div>
            <div className="space-y-2"><Label>{c.arabic}</Label><Input dir="rtl" value={form.labelAr} onChange={(e) => setForm({ ...form, labelAr: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{c.order}</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
              <div className="space-y-2"><Label>{c.status}</Label><select className="h-9 w-full rounded-md border px-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">{c.active}</option><option value="inactive">{c.inactive}</option></select></div>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>{c.cancel}</Button><Button type="submit">{c.save}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

