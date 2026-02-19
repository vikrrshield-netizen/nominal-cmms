// src/hooks/useVoiceRecorder.ts
// VIKRR — Asset Shield — MediaRecorder + Firebase Storage upload

import { useState, useRef, useCallback } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

const MAX_DURATION = 60; // seconds

export function useVoiceRecorder(userId: string) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    setAudioUrl(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;

        setUploading(true);
        try {
          const path = `voice_memos/${userId}/${Date.now()}.webm`;
          const fileRef = storageRef(storage, path);
          await uploadBytes(fileRef, blob);
          const url = await getDownloadURL(fileRef);
          setAudioUrl(url);
        } catch (err) {
          console.error('[VoiceRecorder] Upload failed:', err);
          setError('Nahrávání selhalo');
        }
        setUploading(false);
      };

      recorder.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= MAX_DURATION - 1) {
            stop();
            return MAX_DURATION;
          }
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('[VoiceRecorder] Mic access denied:', err);
      setError('Přístup k mikrofonu odmítnut');
      cleanup();
    }
  }, [userId, stop, cleanup]);

  const reset = useCallback(() => {
    setAudioUrl(null);
    setDuration(0);
    setError('');
    cleanup();
  }, [cleanup]);

  return { isRecording, duration, audioUrl, uploading, error, start, stop, reset };
}
