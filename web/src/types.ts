export interface Player { id: string; name: string; balance: number }
export interface Table { id: string; name: string; game: string; seated: string[] }
export interface Tx { id: string; ts: number; playerId: string; tableId: string | null; delta: number; undone: boolean }
export interface Config { startBalance: number; bigThreshold: number; phase: "play" | "final" }
export interface State { players: Player[]; tables: Table[]; txs: Tx[]; config: Config }
export interface BigEvent { id: string; ts: number; kind: "win" | "loss"; playerName: string; tableName: string; delta: number }
export type ConnectionStatus = "connecting" | "connected" | "reconnecting";
export type Role = "dealer" | "admin";
