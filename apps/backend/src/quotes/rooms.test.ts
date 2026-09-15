import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachVoiceRooms,
  normalizeRoomName,
  parseOptionalRoomId,
  parseOptionalRooms,
  roomNameForId,
  roomsFromDb,
} from "./rooms.js";

const KITCHEN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BATH_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("parseOptionalRoomId", () => {
  it("treats omit as preserve and null/empty as clear", () => {
    assert.deepEqual(parseOptionalRoomId(undefined), { ok: true, roomId: undefined });
    assert.deepEqual(parseOptionalRoomId(null), { ok: true, roomId: null });
    assert.deepEqual(parseOptionalRoomId(""), { ok: true, roomId: null });
  });

  it("accepts a UUID and rejects junk", () => {
    assert.deepEqual(parseOptionalRoomId(KITCHEN_ID), { ok: true, roomId: KITCHEN_ID });
    assert.equal(parseOptionalRoomId("kitchen").ok, false);
    assert.equal(parseOptionalRoomId(1).ok, false);
  });
});

describe("parseOptionalRooms", () => {
  it("treats omit as preserve and null as empty (single-memo)", () => {
    assert.deepEqual(parseOptionalRooms(undefined), { ok: true, rooms: undefined });
    assert.deepEqual(parseOptionalRooms(null), { ok: true, rooms: [] });
    assert.deepEqual(parseOptionalRooms([]), { ok: true, rooms: [] });
  });

  it("accepts id + name and optional contractor-only privateNote", () => {
    const parsed = parseOptionalRooms([
      { id: KITCHEN_ID, name: "  Kitchen  ", privateNote: "don't touch neighbor pipe" },
    ]);
    assert.deepEqual(parsed, {
      ok: true,
      rooms: [
        {
          id: KITCHEN_ID,
          name: "Kitchen",
          privateNote: "don't touch neighbor pipe",
        },
      ],
    });
  });

  it("rejects duplicate ids, missing names, and invented non-UUID ids", () => {
    assert.equal(parseOptionalRooms([{ id: KITCHEN_ID, name: "Kitchen" }, { id: KITCHEN_ID, name: "Bath" }]).ok, false);
    assert.equal(parseOptionalRooms([{ id: KITCHEN_ID, name: "" }]).ok, false);
    assert.equal(parseOptionalRooms([{ id: "kitchen", name: "Kitchen" }]).ok, false);
    assert.equal(parseOptionalRooms("Kitchen").ok, false);
  });
});

describe("roomsFromDb / roomNameForId", () => {
  it("returns [] for junk and looks up a customer-facing name", () => {
    assert.deepEqual(roomsFromDb(undefined), []);
    assert.deepEqual(roomsFromDb("not-json"), []);
    const rooms = roomsFromDb([
      { id: KITCHEN_ID, name: "Kitchen" },
      { id: BATH_ID, name: "Bath" },
    ]);
    assert.equal(roomNameForId(rooms, KITCHEN_ID), "Kitchen");
    assert.equal(roomNameForId(rooms, null), null);
    assert.equal(roomNameForId(rooms, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"), null);
  });
});

describe("attachVoiceRooms", () => {
  it("groups spoken room names case-insensitively and leaves unnamed lines ungrouped", () => {
    let n = 0;
    const ids = [KITCHEN_ID, BATH_ID];
    const attached = attachVoiceRooms(
      [
        { name: "Cabinets", roomName: "kitchen" },
        { name: "Outlets", roomName: "Kitchen" },
        { name: "Labor", roomName: null },
        { name: "Vanity", roomName: "Bath" },
      ],
      () => ids[n++]!,
    );
    assert.equal(attached.rooms.length, 2);
    assert.equal(attached.rooms[0]!.name, "kitchen");
    assert.equal(attached.rooms[1]!.name, "Bath");
    assert.equal(attached.lines[0]!.roomId, KITCHEN_ID);
    assert.equal(attached.lines[1]!.roomId, KITCHEN_ID);
    assert.equal(attached.lines[2]!.roomId, null);
    assert.equal(attached.lines[3]!.roomId, BATH_ID);
    assert.equal(attached.rooms[0]!.privateNote, null);
  });

  it("does not invent a room when extract omitted the name", () => {
    const attached = attachVoiceRooms(
      [{ name: "Outlet", roomName: "  " }, { name: "Breaker" }],
      () => {
        throw new Error("must not mint a room");
      },
    );
    assert.deepEqual(attached.rooms, []);
    assert.equal(attached.lines[0]!.roomId, null);
    assert.equal(attached.lines[1]!.roomId, null);
  });
});

describe("normalizeRoomName", () => {
  it("trims and caps length; empty is null", () => {
    assert.equal(normalizeRoomName("  Kitchen  "), "Kitchen");
    assert.equal(normalizeRoomName(""), null);
    assert.equal(normalizeRoomName(null), null);
    assert.equal(normalizeRoomName("x".repeat(90))?.length, 80);
  });
});
