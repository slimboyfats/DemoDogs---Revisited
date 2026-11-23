import { z } from 'zod';
import type { Controls } from './controls';

/**
 * Online play, after mudders: a small lobby server (packages/signal, on Render) hands out rooms
 * and relays WebRTC set-up; the players then talk directly (or through the server's relay when a
 * direct path fails). The host runs the race and stamps everyone's controls with a tick; every
 * peer runs the same deterministic world from the same seed and the same stamped controls, so only
 * controls cross the wire, never a pixel of the destruction.
 *
 * Bump PROTOCOL_VERSION on any breaking change to a message: the server and the host refuse a
 * mismatched peer with "update your game".
 */
export const PROTOCOL_VERSION = 1;

/** Most drivers in one online race (the rest of the field is AI). */
export const MAX_HUMANS = 6;

/** Room codes: 6 characters without look-alikes (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RoomCodeSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);

const IdSchema = z.string().min(4).max(40);
const SdpSchema = z.string().max(20_000);
/** Largest relayed payload; bigger peer messages are split by the link layer. */
export const RELAY_MAX = 32_000;

export const LinkPathSchema = z.enum(['p2p', 'relay', 'local']);
export type LinkPath = z.infer<typeof LinkPathSchema>;

// ── lobby server: client → server ───────────────────────────────────────────────────────────

export const HelloSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.number().int().nonnegative(),
  /** id + secret reclaim an identity after a dropped socket (a phone changing cells). */
  id: IdSchema.optional(),
  secret: IdSchema.optional(),
});
export const CreateRoomSchema = z.object({
  type: z.literal('createRoom'),
  name: z.string().min(1).max(32),
  public: z.boolean(),
  maxPlayers: z.number().int().min(2).max(MAX_HUMANS),
  /** One line for the public list ("Kennel Loop · race"). */
  summary: z.string().max(80),
  /** Rough region from the host's time zone ("Europe"). */
  region: z.string().max(24),
});
export const RoomSettingsSchema = z.object({
  type: z.literal('roomSettings'),
  name: z.string().min(1).max(32),
  public: z.boolean(),
  maxPlayers: z.number().int().min(1).max(MAX_HUMANS),
  summary: z.string().max(80),
});
export const JoinRoomSchema = z.object({
  type: z.literal('joinRoom'),
  code: RoomCodeSchema,
  /** Coming back to a seat in a race already running (the server forgot us); the host checks. */
  rejoin: z.boolean().optional(),
});
export const LeaveRoomSchema = z.object({ type: z.literal('leaveRoom') });
export const ListRoomsSchema = z.object({ type: z.literal('listRooms') });
/** Host only: the race started (the room leaves the public list), or is back in the lobby. */
export const StartMatchSchema = z.object({ type: z.literal('startMatch'), started: z.boolean() });
const ToOffer = z.object({ type: z.literal('offer'), to: IdSchema, sdp: SdpSchema });
const ToAnswer = z.object({ type: z.literal('answer'), to: IdSchema, sdp: SdpSchema });
const ToIce = z.object({
  type: z.literal('ice'),
  to: IdSchema,
  candidate: z.string().max(2_000).nullable(),
});
const ToRelay = z.object({
  type: z.literal('relay'),
  to: IdSchema,
  data: z.string().max(RELAY_MAX),
});
/** Which path a link took and how long it took to open, for the server's /stats. */
export const PathReportSchema = z.object({
  type: z.literal('path'),
  path: LinkPathSchema,
  ms: z.number().int().min(0).max(600_000),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  HelloSchema,
  CreateRoomSchema,
  RoomSettingsSchema,
  JoinRoomSchema,
  LeaveRoomSchema,
  ListRoomsSchema,
  StartMatchSchema,
  ToOffer,
  ToAnswer,
  ToIce,
  ToRelay,
  PathReportSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ── lobby server: server → client ───────────────────────────────────────────────────────────

export const WelcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.number().int().nonnegative(),
  ok: z.boolean(),
  reason: z.string().optional(),
  id: IdSchema.optional(),
  secret: IdSchema.optional(),
  resumed: z.boolean().optional(),
});
export const RoomUpdateSchema = z.object({
  type: z.literal('roomUpdate'),
  code: RoomCodeSchema,
  name: z.string(),
  host: IdSchema,
  public: z.boolean(),
  maxPlayers: z.number().int(),
  started: z.boolean(),
  /** In join order; the host is first. */
  members: z.array(z.object({ id: IdSchema, connected: z.boolean() })),
});
export const RoomInfoSchema = z.object({
  code: RoomCodeSchema,
  name: z.string(),
  players: z.number().int(),
  maxPlayers: z.number().int(),
  summary: z.string(),
  region: z.string(),
});
export const RoomsSchema = z.object({ type: z.literal('rooms'), rooms: z.array(RoomInfoSchema) });
export const ServerErrorSchema = z.object({
  type: z.literal('error'),
  code: z.enum(['bad', 'notFound', 'full', 'started', 'rateLimited', 'notInRoom', 'notHost']),
  reason: z.string(),
});
const FromOffer = z.object({ type: z.literal('offer'), from: IdSchema, sdp: SdpSchema });
const FromAnswer = z.object({ type: z.literal('answer'), from: IdSchema, sdp: SdpSchema });
const FromIce = z.object({
  type: z.literal('ice'),
  from: IdSchema,
  candidate: z.string().nullable(),
});
const FromRelay = z.object({ type: z.literal('relay'), from: IdSchema, data: z.string() });

export const ServerMessageSchema = z.discriminatedUnion('type', [
  WelcomeSchema,
  RoomUpdateSchema,
  RoomsSchema,
  ServerErrorSchema,
  FromOffer,
  FromAnswer,
  FromIce,
  FromRelay,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type RoomUpdate = z.infer<typeof RoomUpdateSchema>;
export type RoomInfo = z.infer<typeof RoomInfoSchema>;
export type ServerError = z.infer<typeof ServerErrorSchema>;

// ── peer messages (host ⇄ guest, over the data channel or the relay) ───────────────────────

const NameSchema = z.string().min(1).max(12);
const ContentId = z.string().min(1).max(64);
const Paint = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SeatSchema = z.object({
  name: NameSchema,
  car: ContentId,
  paint: Paint,
  connected: z.boolean(),
});
export type Seat = z.infer<typeof SeatSchema>;

/**
 * A stamped control change: tick, seat, packed controls (see packControls). Flat triples keep a
 * second of four drivers' steering to a few hundred bytes.
 */
export const LogSchema = z.array(z.number().int()).max(3 * 200_000);

export const PeerMessageSchema = z.discriminatedUnion('type', [
  /** Guest → host, first thing on a new link. */
  z.object({
    type: z.literal('join'),
    protocolVersion: z.number().int(),
    contentHash: z.string().max(32),
    name: NameSchema,
    car: ContentId,
    /** The last tick this guest simulated, or -1 with no race (first join, or a reload). */
    haveTick: z.number().int(),
  }),
  /** Guest → host: a new car or name in the lobby. */
  z.object({ type: z.literal('pick'), name: NameSchema, car: ContentId }),
  /** Host → guests: the lobby as it stands. */
  z.object({
    type: z.literal('lobby'),
    venue: ContentId,
    seats: z.array(SeatSchema).max(MAX_HUMANS),
    you: z.number().int(),
  }),
  /** Host → guest: the race, from the start (also a rejoin or a resync). */
  z.object({
    type: z.literal('start'),
    seed: z.number().int(),
    venue: ContentId,
    seats: z.array(SeatSchema).max(MAX_HUMANS),
    you: z.number().int(),
    log: LogSchema,
    upTo: z.number().int(),
  }),
  /** Guest → host: this driver's controls changed. */
  z.object({ type: z.literal('ctl'), c: z.number().int() }),
  /** Host → guests: stamped changes, and leave to simulate every tick before `upTo`. */
  z.object({ type: z.literal('tick'), upTo: z.number().int(), log: LogSchema }),
  /** Guest → host: its world hash after tick `t`, for desync detection. */
  z.object({ type: z.literal('hash'), t: z.number().int(), h: z.string().max(32) }),
  /** Host → guests: back to the lobby (the race is over). */
  z.object({ type: z.literal('lobbyAgain') }),
  z.object({ type: z.literal('ping'), n: z.number().int() }),
  z.object({ type: z.literal('pong'), n: z.number().int() }),
  z.object({ type: z.literal('bye'), reason: z.string().max(200) }),
]);
export type PeerMessage = z.infer<typeof PeerMessageSchema>;

// ── controls on the wire ────────────────────────────────────────────────────────────────────

/**
 * Controls in 14 bits: steer in 127 steps, throttle in 16, then brake, boost, fire. Every peer
 * (the host too, for its own car) drives with the unpacked value, so they all agree to the bit.
 */
export function packControls(c: Controls): number {
  const s = Math.round(Math.max(-1, Math.min(1, c.steer)) * 63) + 63;
  const t = Math.round(Math.max(0, Math.min(1, c.throttle)) * 15);
  return s | (t << 7) | (c.brake ? 1 << 11 : 0) | (c.boost ? 1 << 12 : 0) | (c.fire ? 1 << 13 : 0);
}

export function unpackControls(n: number): Controls {
  return {
    steer: ((n & 127) - 63) / 63,
    throttle: ((n >> 7) & 15) / 15,
    brake: (n & (1 << 11)) !== 0,
    boost: (n & (1 << 12)) !== 0,
    fire: (n & (1 << 13)) !== 0,
  };
}
