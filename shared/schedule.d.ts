export declare const AVAILABLE: 2
export declare const IF_NEEDED: 1
export type Slot = { i: number; t: number }
export type Suggestion = { start: number; end: number; slotIndex: number; can: string[]; ifNeeded: string[]; cannot: string[]; score: number }
export declare function minToHHMM(m: number): string
export declare function buildSlots(ev: any): Slot[]
export declare function layoutForTz(slots: Slot[], tz: string): { cols: string[]; rows: number[]; cell: Map<string, number> }
export declare function suggestTimes(ev: any, limit?: number): Suggestion[]
export declare function slotCounts(ev: any): { avail: string[]; maybe: string[] }[]
export declare function looksSuspicious(ev: any, a: Record<string, number>): boolean
export declare function fakeCalendarAvailability(ev: any, seed: string): Record<number, number>
export declare function respondedParticipants(ev: any): any[]
export declare function formatRange(s: number, e: number, tz: string): string
