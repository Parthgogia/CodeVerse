export declare const RoomDocs: {
    /** Warm the document so a joining client gets its state without a stall. */
    prepare(roomId: string): Promise<void>;
    /** Fold a client's Yjs update into the room's document and queue a save. */
    applyUpdate(roomId: string, update: Uint8Array): Promise<void>;
    /** The room's current state, as bytes a client can Y.applyUpdate directly. */
    getState(roomId: string): Promise<Uint8Array>;
    /** Plain text of the document — used for the room:state text fallback. */
    getText(roomId: string): Promise<string>;
    /** Last local participant left: write the document out and free the memory. */
    release(roomId: string): Promise<void>;
    /** Drop without saving — the room no longer exists. */
    forget(roomId: string): void;
    /** Flush every open document (graceful shutdown). */
    flushAll(): Promise<void>;
    stats(): {
        open: number;
    };
};
//# sourceMappingURL=roomDocs.d.ts.map