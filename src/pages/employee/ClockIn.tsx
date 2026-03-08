import React, { useState, useRef } from 'react';
import { Camera, MapPin, LogIn, LogOut, Coffee, Fingerprint } from 'lucide-react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { db, storage, isSupabaseConfigured } from '../../services/supabaseClient';
import { LogType, PunchMethod } from '../../../types';
import { LoadingState } from '../../../components/UI';

const EmployeeClockIn: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastType, setLastType] = useState<string | null>(null);
  const [useDigital, setUseDigital] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadLastRecord = async () => {
    if (!user || !isSupabaseConfigured) return;
    try {
      const rows = (await db.select('time_records', [{ column: 'user_id', operator: 'eq', value: user.id }], { column: 'created_at', ascending: false }, 1)) as any[];
      if (rows?.[0]) setLastType(rows[0].type);
      else setLastType(null);
    } catch {
      setLastType(null);
    }
  };

  React.useEffect(() => {
    loadLastRecord();
  }, [user?.id]);

  const capturePhoto = (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        resolve(null);
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then((stream) => {
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          resolve(null);
          return;
        }
        video.srcObject = stream;
        video.play().then(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            stream.getTracks().forEach((t) => t.stop());
            resolve(null);
            return;
          }
          ctx.drawImage(video, 0, 0);
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        }).catch(() => resolve(null));
      }).catch(() => resolve(null));
    });
  };

  const tryWebAuthn = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'preferred',
        },
      });
      return true;
    } catch {
      return false;
    }
  };

  const getLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const uploadPhoto = async (dataUrl: string): Promise<string | null> => {
    if (!storage || !user) return null;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `punch-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const path = `${user.id}/${Date.now()}-${file.name}`;
      await storage.upload('photos', path, file);
      return storage.getPublicUrl('photos', path);
    } catch {
      return null;
    }
  };

  const handlePunch = async (type: LogType) => {
    if (!user?.companyId || !isSupabaseConfigured) return;
    setSaving(true);
    setError(null);
    try {
      const location = await getLocation();
      let photoUrl: string | null = null;
      let method = PunchMethod.PHOTO;

      if (useDigital) {
        const ok = await tryWebAuthn();
        if (ok) {
          method = PunchMethod.BIOMETRIC;
        } else {
          const dataUrl = await capturePhoto();
          if (dataUrl) photoUrl = await uploadPhoto(dataUrl);
          method = PunchMethod.PHOTO;
        }
      } else {
        const dataUrl = await capturePhoto();
        if (dataUrl) photoUrl = await uploadPhoto(dataUrl);
        method = PunchMethod.PHOTO;
      }

      const now = new Date().toISOString();
      await db.insert('time_records', {
        id: crypto.randomUUID(),
        user_id: user.id,
        company_id: user.companyId,
        type: type === LogType.IN ? 'entrada' : type === LogType.OUT ? 'saída' : 'pausa',
        method,
        created_at: now,
        updated_at: now,
        location: location ? { lat: location.lat, lng: location.lng } : undefined,
        photo_url: photoUrl || undefined,
      });
      await loadLastRecord();
    } catch (e: any) {
      setError(e?.message || 'Erro ao registrar ponto');
    } finally {
      setSaving(false);
    }
  };

  const isIn = lastType === 'entrada';
  const isBreak = lastType === 'pausa';

  if (loading || !user) return <LoadingState message="Carregando..." />;

  return (
    <div className="space-y-8">
      <PageHeader title="Registrar Ponto" />

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/50">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Método:</span>
        <button
          type="button"
          onClick={() => setUseDigital(false)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!useDigital ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
        >
          <Camera className="w-4 h-4" /> Foto
        </button>
        <button
          type="button"
          onClick={() => setUseDigital(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${useDigital ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
        >
          <Fingerprint className="w-4 h-4" /> Digital (WebAuthn)
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-500 ml-1">Se não suportado, usa foto.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button
          type="button"
          disabled={saving || isIn}
          onClick={() => handlePunch(LogType.IN)}
          className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <LogIn className="w-16 h-16" />
          <span className="text-xl font-bold">Registrar Entrada</span>
        </button>
        <button
          type="button"
          disabled={saving || !isIn}
          onClick={() => handlePunch(LogType.OUT)}
          className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <LogOut className="w-16 h-16" />
          <span className="text-xl font-bold">Registrar Saída</span>
        </button>
        <button
          type="button"
          disabled={saving || !isIn || isBreak}
          onClick={() => handlePunch(LogType.BREAK)}
          className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Coffee className="w-16 h-16" />
          <span className="text-xl font-bold">Iniciar Intervalo</span>
        </button>
        <button
          type="button"
          disabled={saving || !isBreak}
          onClick={() => handlePunch(LogType.BREAK)}
          className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Coffee className="w-16 h-16" />
          <span className="text-xl font-bold">Finalizar Intervalo</span>
        </button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <MapPin className="w-4 h-4" /> GPS e {useDigital ? 'impressão digital (ou foto como fallback)' : 'foto'} ao registrar.
      </p>

      <video ref={videoRef} className="hidden" playsInline muted />
    </div>
  );
};

export default EmployeeClockIn;
