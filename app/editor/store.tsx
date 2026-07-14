"use client";

import { createContext, useContext, useReducer, ReactNode, Dispatch } from "react";

export type MediaItem = {
  id: string;
  kind: "video" | "image";
  thumbnail: string;
  previewUrl: string;
  duration: number;
  source: string;
};

export type SelectedClip = {
  media: MediaItem;
  trimStart: number;
  trimEnd: number;
  gap?: boolean; // an empty slot: holds its place and duration until filled
};

export function makeGapMedia(): MediaItem {
  return {
    id: `gap-${Math.random().toString(36).slice(2, 9)}`,
    kind: "image",
    thumbnail: "",
    previewUrl: "",
    duration: 0,
    source: "empty",
  };
}

export type Beat = {
  text: string;
  keywords: string[];
  entities?: string[];
  queries?: string[];
  treatment: "video" | "image";
  duration: number;
  start: number;
  end: number;
  videos?: MediaItem[];
  images?: MediaItem[];
  loadingMedia?: boolean;
  mediaPage?: number;
  era?: string;
  providers?: string[];
  map?: { template: string; score: number; region?: string; locations: { name: string; lat: number; lon: number }[] };
  selectedClips: SelectedClip[];
};

export type ProjectSettings = {
  captionsEnabled: boolean;
  calloutsEnabled: boolean;
  countupLevel: "off" | "low" | "medium" | "high";
  textStyle: string;
  background: string;
  bgFrequency: "2-3" | "3-5" | "always";
  mediaPref: "both" | "video" | "image" | null;
  autoFill: boolean;
  sfxShutter: boolean;
  sfxCountup: boolean;
  historyMode: boolean;
};

export type TextEventCallout = { id: string; text: string; start: number; end: number };
export type TextEventCountup = {
  id: string;
  phrase?: string;
  value: number;
  prefix: string;
  suffix: string;
  decimals: number;
  compact: boolean;
  importance?: number;
  animStart: number;
  land: number;
};
export type TextEvents = { callouts: TextEventCallout[]; countups: TextEventCountup[] };

export type SelectedTimelineItem =
  | { type: "clip"; beatIndex: number; clipId: string }
  | { type: "beat"; beatIndex: number }
  | { type: "text"; eventId: string }
  | { type: "caption"; wordStart: number; wordEnd: number }
  | null;

export type ProjectState = {
  script: string;
  words: { word: string; start: number; end: number }[];
  audioFile: File | null;
  musicFile: File | null;
  beats: Beat[];
  settings: ProjectSettings;
  textEvents: TextEvents | null;
  currentTime: number;
  playing: boolean;
  selected: SelectedTimelineItem;
};

export const initialState: ProjectState = {
  script: "",
  words: [],
  audioFile: null,
  musicFile: null,
  beats: [],
  settings: {
    captionsEnabled: true,
    calloutsEnabled: true,
    countupLevel: "medium",
    textStyle: "standard",
    background: "none",
    bgFrequency: "2-3",
    mediaPref: null,
    autoFill: false,
    sfxShutter: true,
    sfxCountup: true,
    historyMode: false,
  },
  textEvents: null,
  currentTime: 0,
  playing: false,
  selected: null,
};

export type Action =
  | { type: "SET_SCRIPT"; script: string }
  | { type: "SET_WORDS"; words: ProjectState["words"] }
  | { type: "SET_AUDIO"; file: File | null }
  | { type: "SET_MUSIC"; file: File | null }
  | { type: "SET_BEATS"; beats: Beat[] }
  | { type: "PATCH_BEAT"; index: number; patch: Partial<Beat> }
  | { type: "SET_SETTING"; key: keyof ProjectSettings; value: any }
  | { type: "SELECT"; item: SelectedTimelineItem }
  | { type: "SET_TIME"; t: number }
  | { type: "SET_PLAYING"; playing: boolean }
  | { type: "EDIT_CAPTION"; wordStart: number; wordEnd: number; text: string }
  | { type: "SET_TEXT_EVENTS"; events: TextEvents }
  | { type: "REMOVE_TEXT_EVENT"; eventId: string }
  | { type: "UNDO" }
  | { type: "REDO" };

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case "SET_SCRIPT":
      return { ...state, script: action.script };
    case "SET_WORDS":
      return { ...state, words: action.words };
    case "SET_AUDIO":
      return { ...state, audioFile: action.file };
    case "SET_MUSIC":
      return { ...state, musicFile: action.file };
    case "SET_BEATS":
      return { ...state, beats: action.beats, selected: null };
    case "PATCH_BEAT":
      return {
        ...state,
        beats: state.beats.map((b, i) => (i === action.index ? { ...b, ...action.patch } : b)),
      };
    case "SET_SETTING":
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
    case "SELECT":
      return { ...state, selected: action.item };
    case "SET_TIME":
      return { ...state, currentTime: action.t };
    case "SET_PLAYING":
      return { ...state, playing: action.playing };
    case "EDIT_CAPTION": {
      const { wordStart, wordEnd, text } = action;
      if (wordStart < 0 || wordEnd >= state.words.length || wordEnd < wordStart) return state;
      const tokens = text.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return state;
      // New text spreads evenly across the chunk's original time span -
      // caption timing stays glued to the narration
      const spanStart = state.words[wordStart].start;
      const spanEnd = state.words[wordEnd].end;
      const per = (spanEnd - spanStart) / tokens.length;
      const replaced = tokens.map((tok, i) => ({
        word: tok,
        start: spanStart + i * per,
        end: spanStart + (i + 1) * per,
      }));
      return {
        ...state,
        words: [...state.words.slice(0, wordStart), ...replaced, ...state.words.slice(wordEnd + 1)],
        selected: null,
      };
    }
    case "SET_TEXT_EVENTS":
      return { ...state, textEvents: action.events };
    case "REMOVE_TEXT_EVENT": {
      if (!state.textEvents) return state;
      const cleared =
        state.selected?.type === "text" && state.selected.eventId === action.eventId
          ? null
          : state.selected;
      return {
        ...state,
        textEvents: {
          callouts: state.textEvents.callouts.filter((c) => c.id !== action.eventId),
          countups: state.textEvents.countups.filter((c) => c.id !== action.eventId),
        },
        selected: cleared,
      };
    }
    default:
      return state;
  }
}

// Content changes are undoable; playhead, play/pause and selection are not -
// Cmd+Z should never rewind the playhead.
const UNDOABLE = new Set([
  "SET_SCRIPT",
  "SET_WORDS",
  "SET_AUDIO",
  "SET_MUSIC",
  "SET_BEATS",
  "PATCH_BEAT",
  "SET_SETTING",
  "EDIT_CAPTION",
  "SET_TEXT_EVENTS",
  "REMOVE_TEXT_EVENT",
]);

// Rapid edits of the same thing merge into one history step (typing in the
// script box, nudging a trim input) so one undo doesn't take forty presses.
const COALESCE_MS = 700;
const MAX_HISTORY = 50;

function actionLabel(a: Action): string {
  switch (a.type) {
    case "PATCH_BEAT":
      return `beat-${a.index}`;
    case "SET_SETTING":
      return `setting-${String(a.key)}`;
    default:
      return a.type;
  }
}

type History = {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  lastLabel: string | null;
  lastAt: number;
};

function historyReducer(h: History, action: Action): History {
  if (action.type === "UNDO") {
    if (h.past.length === 0) return h;
    const previous = h.past[h.past.length - 1];
    return {
      past: h.past.slice(0, -1),
      present: { ...previous, currentTime: h.present.currentTime, playing: false },
      future: [h.present, ...h.future],
      lastLabel: null,
      lastAt: 0,
    };
  }

  if (action.type === "REDO") {
    if (h.future.length === 0) return h;
    const next = h.future[0];
    return {
      past: [...h.past, h.present],
      present: { ...next, currentTime: h.present.currentTime, playing: false },
      future: h.future.slice(1),
      lastLabel: null,
      lastAt: 0,
    };
  }

  const nextState = reducer(h.present, action);
  if (nextState === h.present) return h;

  if (!UNDOABLE.has(action.type)) {
    return { ...h, present: nextState };
  }

  const now = Date.now();
  const label = actionLabel(action);
  const merge = h.lastLabel === label && now - h.lastAt < COALESCE_MS;

  return {
    past: merge ? h.past : [...h.past, h.present].slice(-MAX_HISTORY),
    present: nextState,
    future: [],
    lastLabel: label,
    lastAt: now,
  };
}

const ProjectContext = createContext<{
  state: ProjectState;
  dispatch: Dispatch<Action>;
  canUndo: boolean;
  canRedo: boolean;
} | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialState,
    future: [],
    lastLabel: null,
    lastAt: 0,
  });

  return (
    <ProjectContext.Provider
      value={{
        state: history.present,
        dispatch,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
