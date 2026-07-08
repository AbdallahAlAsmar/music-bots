export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string | null;
  requestedBy: string;
  sourceQuery?: string;
  artistName?: string;
  albumName?: string;
  durationSeconds?: number;
}

export type LoopMode = "off" | "track" | "queue";

export interface EnqueueResult {
  added: Track[];
  startedPlayback: boolean;
  nowPlaying: Track | null;
}
export type TrackStartHandler = (track: Track) => Promise<void> | void;
