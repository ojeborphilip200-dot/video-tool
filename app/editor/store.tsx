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
};

export type SelectedTimelineItem =
  | { type: "clip"; beatIndex: number; clipId: string }
  | { type: "beat"; beatIndex: number }
  | null;

export type ProjectState = {
  script: string;
  words: { word: string; start: number; end: number }[];
  audioFile: File | null;
  musicFile: File | null;
  beats: Beat[];
  settings: ProjectSettings;
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
  },
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
  | { type: "SET_PLAYING"; playing: boolean };

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
    default:
      return state;
  }
}

const ProjectContext = createContext<{ state: ProjectState; dispatch: Dispatch<Action> } | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <ProjectContext.Provider value={{ state, dispatch }}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
