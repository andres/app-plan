import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api.ts';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
export type Update<T> = (fn: (doc: T) => T) => void;

type Store<T> = { get: (id: string) => Promise<{ rev: number; doc: T }>; save: (id: string, rev: number, doc: T) => Promise<{ rev: number }> };

/**
 * Loads a document and saves it shortly after each edit, with revision checks so two
 * devices can't silently overwrite each other. Saves immediately when the app is backgrounded.
 */
export function useAutosave<T>(store: Store<T>, id: string) {
  const [doc, setDoc] = useState<T | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<SaveStatus>('saved');
  const rev = useRef(0);
  const latest = useRef<T | null>(null);
  const dirty = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const blocked = useRef(false); // conflict: stop saving until reload
  latest.current = doc;

  useEffect(() => {
    store.get(id).then(
      (r) => { rev.current = r.rev; setDoc(r.doc); },
      (e) => setLoadError(e.message),
    );
  }, [store, id]);

  const flush = useCallback((): Promise<void> => {
    if (saving.current) return saving.current.then(() => (dirty.current ? flush() : undefined));
    if (!dirty.current || blocked.current || !latest.current) return Promise.resolve();
    dirty.current = false;
    setStatus('saving');
    const p = (async () => {
      try {
        rev.current = (await store.save(id, rev.current, latest.current!)).rev;
        setStatus(dirty.current ? 'unsaved' : 'saved');
      } catch (e) {
        dirty.current = true;
        if (e instanceof ApiError && e.status === 409) {
          blocked.current = true;
          setStatus('conflict');
        } else {
          setStatus('error');
          setTimeout(() => void flush(), 5000);
        }
      } finally {
        saving.current = null;
      }
    })();
    saving.current = p;
    return p.then(() => (dirty.current && !blocked.current ? flush() : undefined));
  }, [store, id]);

  const update: Update<T> = useCallback((fn) => {
    dirty.current = true;
    setDoc((d) => (d ? fn(d) : d));
  }, []);

  useEffect(() => {
    if (!doc || !dirty.current || blocked.current) return;
    setStatus((s) => (s === 'saving' ? s : 'unsaved'));
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [doc, flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    document.addEventListener('visibilitychange', onHide);
    addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('beforeunload', onUnload);
    };
  }, [flush]);

  return { doc, loadError, status, update, flush };
}

export const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Offline, retrying…', conflict: 'Changed elsewhere',
};
