import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useBot } from "@/modules/bot/BotProvider";

const STORAGE_KEY = "nexus_sound_on_operation";
const SOUND_URL = "/sounds/sucesso.mp3";

function loadStored(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

function saveStored(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

type SoundOnOperationContextType = {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
};

const SoundOnOperationContext = createContext<SoundOnOperationContextType | null>(null);

export function SoundOnOperationProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundState] = useState(loadStored);
  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundState(enabled);
    saveStored(enabled);
  }, []);

  return (
    <SoundOnOperationContext.Provider value={{ soundEnabled, setSoundEnabled }}>
      <SoundOnOperationListener
        soundEnabled={soundEnabled}
        audioRef={audioRef}
        prevCountRef={prevCountRef}
      />
      {children}
    </SoundOnOperationContext.Provider>
  );
}

function SoundOnOperationListener({
  soundEnabled,
  audioRef,
  prevCountRef,
}: {
  soundEnabled: boolean;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  prevCountRef: React.MutableRefObject<number>;
}) {
  const { operations, status } = useBot();

  useEffect(() => {
    if (status !== "running" || !soundEnabled) {
      prevCountRef.current = operations.length;
      return;
    }
    const currentCount = operations.length;
    if (currentCount > prevCountRef.current) {
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(SOUND_URL);
        }
        const audio = audioRef.current;
        audio.volume = 0.7;
        audio.currentTime = 0;
        audio.play().catch(() => {
          /* autoplay policy may block */
        });
      } catch {
        /* ignore */
      }
    }
    prevCountRef.current = currentCount;
  }, [operations.length, status, soundEnabled, prevCountRef, audioRef]);

  return null;
}

export function useSoundOnOperation() {
  const ctx = useContext(SoundOnOperationContext);
  if (!ctx) throw new Error("useSoundOnOperation must be used within SoundOnOperationProvider");
  return ctx;
}
