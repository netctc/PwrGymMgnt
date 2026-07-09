import { FormEvent, useEffect, useRef, useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { membershipApi, type MembershipMember, type MembershipSubscription } from '../lib/membershipApi';
import { AlertTriangle, Camera, CameraOff, CheckCircle, Clock, Keyboard, ScanLine, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type ScanRecord = {
  id: string;
  timestamp: Date;
  result: 'success' | 'error';
  name?: string;
  details?: string;
};

type ScanData = {
  member?: MembershipMember;
  subscription?: MembershipSubscription;
  name: string;
  details: string;
};

type BrowserBarcodeDetector = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};

type BrowserBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BrowserBarcodeDetector;

function formatTime(value: Date) {
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function memberName(member?: MembershipMember) {
  if (!member) return 'Unknown Member';
  return `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email || member.id;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${parsed.getFullYear()}`;
}

function readBarcodeDetector(): BrowserBarcodeDetectorConstructor | null {
  return typeof window !== 'undefined' ? ((window as any).BarcodeDetector as BrowserBarcodeDetectorConstructor | undefined) || null : null;
}

function extractAccessToken(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed);
    const candidate = parsed?.token || parsed?.accessToken || parsed?.access_token || parsed?.qrToken;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  } catch {
    // Not JSON; continue with URL/plain parsing.
  }

  try {
    const url = new URL(trimmed);
    const candidate = url.searchParams.get('token') || url.searchParams.get('accessToken') || url.searchParams.get('access_token');
    if (candidate?.trim()) return candidate.trim();
  } catch {
    // Not an absolute URL; continue with plain parsing.
  }

  if (trimmed.startsWith('powergym-access:')) return trimmed.slice('powergym-access:'.length).trim();
  return trimmed;
}

export default function QRScanner() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [scannedToken, setScannedToken] = useState('');
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [barcodeSupported] = useState(() => Boolean(readBarcodeDetector()));
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<BrowserBarcodeDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const cameraRunningRef = useRef(false);
  const processingTokenRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);

  const stopCamera = () => {
    cameraRunningRef.current = false;
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => stopCamera, []);

  const processScan = async (rawToken: string) => {
    const cleanedToken = extractAccessToken(rawToken);
    if (!cleanedToken) return;

    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    setScanning(true);
    setLastError(null);
    setScannedToken('');
    inputRef.current?.blur();

    try {
      const response = await membershipApi.validateAccess(cleanedToken);
      const name = memberName(response.member);
      const details = response.subscription
        ? `${response.subscription.planName} active until ${formatDate(response.subscription.endDate)}`
        : 'Valid access token';

      setResult('success');
      setScanData({ member: response.member, subscription: response.subscription, name, details });
      setScanHistory((current) => [
        { id: crypto.randomUUID(), timestamp: new Date(), result: 'success', name, details },
        ...current,
      ].slice(0, 10));
      toast.success(`Access granted for ${name}`);
    } catch (err: any) {
      const message = err.message || 'Access denied';
      setResult('error');
      setScanData({ name: 'Access Denied', details: message });
      setLastError(message);
      setScanHistory((current) => [
        { id: crypto.randomUUID(), timestamp: new Date(), result: 'error', name: 'Access Denied', details: message },
        ...current,
      ].slice(0, 10));
      toast.error(message);
    } finally {
      setScanning(false);
      resetTimerRef.current = window.setTimeout(() => {
        setResult(null);
        setScanData(null);
        inputRef.current?.focus();
      }, 4000);
    }
  };

  const scanCameraFrame = async () => {
    if (!cameraRunningRef.current || !videoRef.current || !detectorRef.current) return;

    const video = videoRef.current;
    if (!processingTokenRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        const barcodes = await detectorRef.current.detect(video);
        const value = barcodes.find((barcode) => barcode.rawValue?.trim())?.rawValue;
        if (value) {
          processingTokenRef.current = true;
          stopCamera();
          await processScan(value);
          processingTokenRef.current = false;
          return;
        }
      } catch (error: any) {
        setCameraError(error?.message || 'Unable to read QR code from camera frame.');
      }
    }

    if (cameraRunningRef.current) animationRef.current = window.requestAnimationFrame(scanCameraFrame);
  };

  const startCamera = async () => {
    setCameraError(null);
    const Detector = readBarcodeDetector();
    if (!Detector) {
      setCameraError('This browser does not support camera QR detection. Use Chrome/Edge, a USB QR scanner, or paste the token manually.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available in this browser. Use a USB QR scanner or paste the token manually.');
      return;
    }

    try {
      detectorRef.current = new Detector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      cameraRunningRef.current = true;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      animationRef.current = window.requestAnimationFrame(scanCameraFrame);
    } catch (error: any) {
      stopCamera();
      setCameraError(error?.message || 'Unable to open camera. Check browser permissions and try again.');
    }
  };

  const submitScan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    processScan(scannedToken);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">QR Access Control</h1>
        <p className="mt-1 text-sm text-slate-500">
          Validate secure member e-card tokens generated from Member Directory.
        </p>
      </div>

      {lastError && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-4 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Last scan failed</p>
              <p className="text-sm">{lastError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50">
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <Camera className="h-5 w-5" /> Webcam QR Reader
          </CardTitle>
          <CardDescription>
            Reads the same QR code generated from Member Directory. USB/handheld QR readers continue to work through the input below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
            {cameraActive ? (
              <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-slate-400">
                <ScanLine className="h-12 w-12" />
                <p className="max-w-sm text-sm">
                  Start the webcam scanner, then point the camera at the member QR e-card.
                </p>
              </div>
            )}
          </div>
          {cameraError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {cameraError}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {cameraActive ? (
              <Button type="button" variant="outline" onClick={stopCamera} disabled={scanning}>
                <CameraOff className="mr-2 h-4 w-4" /> Stop Camera
              </Button>
            ) : (
              <Button type="button" onClick={startCamera} disabled={scanning}>
                <Camera className="mr-2 h-4 w-4" /> Start Webcam Scan
              </Button>
            )}
            {!barcodeSupported && (
              <span className="text-xs text-slate-500">
                Webcam QR detection requires browser BarcodeDetector support. USB QR scanners and manual token entry still work.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="relative min-h-[400px] overflow-hidden border-slate-200 shadow-lg">
        {scanning && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-indigo-50/80 backdrop-blur-sm">
            <ScanLine className="mb-4 h-16 w-16 animate-bounce text-indigo-500" />
            <p className="text-lg font-medium text-indigo-800">Validating access token...</p>
          </div>
        )}

        <CardHeader className="border-b border-slate-100 bg-slate-50 text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-slate-700">
            <ShieldCheck className="h-5 w-5" /> Scanner Terminal
          </CardTitle>
          <CardDescription>Use webcam, USB QR reader, or paste the token generated from the Members screen.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-[300px] items-center justify-center p-12 text-center">
          {!result && !scanning && (
            <div className="flex flex-col items-center text-slate-400">
              <ScanLine className="mb-6 h-24 w-24 stroke-[1]" />
              <p className="max-w-sm text-sm">
                Scan a member e-card. The backend checks token integrity, token expiry, member status, and active subscription dates.
              </p>
            </div>
          )}

          {result === 'success' && !scanning && scanData && (
            <div className="flex animate-in flex-col items-center text-emerald-500 duration-300 fade-in zoom-in">
              <CheckCircle className="mb-4 h-24 w-24" />
              <h3 className="text-2xl font-bold text-emerald-600">Access Granted</h3>
              <p className="mt-2 font-medium text-emerald-700/80">{scanData.name}</p>
              <p className="mt-1 text-xs text-emerald-600">{scanData.details}</p>
            </div>
          )}

          {result === 'error' && !scanning && scanData && (
            <div className="flex animate-in flex-col items-center text-rose-500 duration-300 fade-in zoom-in">
              <XCircle className="mb-4 h-24 w-24" />
              <h3 className="text-2xl font-bold text-rose-600">Access Denied</h3>
              <p className="mt-2 font-medium text-rose-700/80">{scanData.details}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={submitScan} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Keyboard className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input
            ref={inputRef}
            placeholder="Scan QR with USB reader or paste secure token..."
            className="h-10 pl-10 text-base"
            value={scannedToken}
            onChange={(event) => setScannedToken(event.target.value)}
            disabled={scanning}
            autoFocus
          />
        </div>
        <Button className="h-10 px-6" type="submit" disabled={scanning || !scannedToken.trim()}>
          Verify
        </Button>
      </form>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-medium text-slate-700">Recent Scans</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {scanHistory.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No recent scans.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {scanHistory.map((record) => (
                <li key={record.id} className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${record.result === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div>
                      <p className={`text-sm font-medium ${record.result === 'success' ? 'text-slate-900' : 'text-rose-900'}`}>{record.name}</p>
                      <p className="text-xs text-slate-500">{record.details}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={record.result === 'success' ? 'default' : 'destructive'}>{record.result}</Badge>
                    <span className="font-mono text-xs font-medium text-slate-400">{formatTime(record.timestamp)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
