import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ContractorPayload } from "../types/auth.js";
import type { RefreshQueryFn } from "./refresh.js";
import {
  INSERT_REFRESH_TOKEN_SQL,
  INVALID_REFRESH_TOKEN_ERROR,
  REVOKE_REFRESH_TOKEN_SQL,
  SELECT_CONTRACTOR_FOR_REFRESH_SQL,
  SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL,
  hashRefreshToken,
  rotateRefreshToken,
} from "./refresh.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN_ID = "11111111-1111-4111-8111-111111111111";
const RAW_REFRESH = "current-refresh-token";
const NEXT_REFRESH = "next-refresh-token";
const ACCESS_TOKEN = "signed-access-token";

const contractor = {
  id: CONTRACTOR_ID,
  email: "a@example.com",
  phone: null as string | null,
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function signAccessToken(payload: ContractorPayload): string {
  assert.equal(payload.contractorId, CONTRACTOR_ID);
  assert.equal(payload.email, contractor.email);
  assert.equal(payload.phone, contractor.phone);
  return ACCESS_TOKEN;
}

function rotateArgs(
  overrides: Partial<Parameters<typeof rotateRefreshToken>[1]> = {},
): Parameters<typeof rotateRefreshToken>[1] {
  return {
    refreshToken: RAW_REFRESH,
    signAccessToken,
    generateRefreshToken: () => NEXT_REFRESH,
    ...overrides,
  };
}

describe("rotateRefreshToken SQL", () => {
  it("locks the refresh row with FOR UPDATE on the SHA-256 hash", () => {
    assert.match(SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL, /FOR UPDATE\s*$/);
    assert.match(SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL, /revoked_at IS NULL/);
    assert.match(SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL, /expires_at > NOW\(\)/);
    assert.match(SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL, /token_hash = \$1/);
  });
});

describe("rotateRefreshToken", () => {
  function mockDb(
    options: {
      token?: { id: string; contractor_id: string } | null;
      contractor?: typeof contractor | null;
      failOn?: "revoke" | "insert";
    } = {},
  ) {
    const token =
      options.token === undefined
        ? { id: TOKEN_ID, contractor_id: CONTRACTOR_ID }
        : options.token;
    const contractorRow =
      options.contractor === undefined ? contractor : options.contractor;
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];

    const queryFn: RefreshQueryFn = async (sql, params) => {
      calls.push({ sql, params });
      if (sql === SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL) {
        return { rows: token ? [token] : [] };
      }
      if (sql === SELECT_CONTRACTOR_FOR_REFRESH_SQL) {
        return { rows: contractorRow ? [contractorRow] : [] };
      }
      if (sql === REVOKE_REFRESH_TOKEN_SQL) {
        if (options.failOn === "revoke") {
          throw new Error("revoke failed");
        }
        return { rows: [] };
      }
      if (sql === INSERT_REFRESH_TOKEN_SQL) {
        if (options.failOn === "insert") {
          throw new Error("insert failed");
        }
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    };

    return { calls, queryFn };
  }

  function callKinds(calls: Array<{ sql: string }>): string[] {
    return calls.map((c) => {
      if (c.sql === SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL) return "lock";
      if (c.sql === SELECT_CONTRACTOR_FOR_REFRESH_SQL) return "contractor";
      if (c.sql === REVOKE_REFRESH_TOKEN_SQL) return "revoke";
      if (c.sql === INSERT_REFRESH_TOKEN_SQL) return "insert";
      return "other";
    });
  }

  it("locks, revokes, then inserts on one queryFn so withTransaction can wrap the boundary", async () => {
    const { calls, queryFn } = mockDb();
    const outcome = await rotateRefreshToken(queryFn, rotateArgs());

    assert.deepEqual(outcome, {
      status: 200,
      json: { accessToken: ACCESS_TOKEN, refreshToken: NEXT_REFRESH },
    });
    assert.deepEqual(callKinds(calls), ["lock", "contractor", "revoke", "insert"]);
    assert.deepEqual(calls[0]?.params, [hashRefreshToken(RAW_REFRESH)]);
    assert.deepEqual(calls[2]?.params, [TOKEN_ID]);
    assert.deepEqual(calls[3]?.params, [CONTRACTOR_ID, hashRefreshToken(NEXT_REFRESH)]);
  });

  it("returns 401 without revoke or insert when the locked select matches no row", async () => {
    const { calls, queryFn } = mockDb({ token: null });
    const outcome = await rotateRefreshToken(queryFn, rotateArgs());
    assert.deepEqual(outcome, {
      status: 401,
      json: { error: INVALID_REFRESH_TOKEN_ERROR },
    });
    assert.deepEqual(callKinds(calls), ["lock"]);
  });

  it("returns 401 without revoke or insert when the contractor is missing", async () => {
    const { calls, queryFn } = mockDb({ contractor: null });
    const outcome = await rotateRefreshToken(queryFn, rotateArgs());
    assert.deepEqual(outcome, {
      status: 401,
      json: { error: INVALID_REFRESH_TOKEN_ERROR },
    });
    assert.deepEqual(callKinds(calls), ["lock", "contractor"]);
  });

  it("throws after revoke and before insert so withTransaction can roll back the revoke", async () => {
    const { calls, queryFn } = mockDb({ failOn: "insert" });
    await assert.rejects(
      () => rotateRefreshToken(queryFn, rotateArgs()),
      /insert failed/,
    );
    assert.deepEqual(callKinds(calls), ["lock", "contractor", "revoke", "insert"]);
  });
});

describe("overlapping refresh on a row lock", () => {
  type RefreshRow = {
    id: string;
    contractor_id: string;
    token_hash: string;
    revoked_at: Date | null;
  };

  /**
   * In-memory stand-in for Postgres `SELECT … FOR UPDATE` on one refresh row:
   * a second transaction blocks until the holder commits/rolls back, then
   * re-evaluates `revoked_at IS NULL`.
   */
  class LockedRefreshStore {
    row: RefreshRow;
    inserts: string[] = [];
    waiters = 0;
    onWaiterBlocked: (() => void) | null = null;
    private holder: { wait: Promise<void>; release: () => void } | null = null;
    private rowSnapshot: RefreshRow;
    private insertSnapshot: string[] = [];

    constructor(row: RefreshRow) {
      this.row = { ...row };
      this.rowSnapshot = { ...row };
    }

    async selectForUpdate(tokenHash: string): Promise<RefreshRow[]> {
      while (this.holder) {
        this.waiters += 1;
        this.onWaiterBlocked?.();
        try {
          await this.holder.wait;
        } finally {
          this.waiters -= 1;
        }
      }
      let release!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      this.holder = { wait, release };
      if (this.row.token_hash !== tokenHash || this.row.revoked_at !== null) {
        return [];
      }
      return [{ ...this.row }];
    }

    revoke(id: string): void {
      if (this.row.id === id) {
        this.row.revoked_at = new Date();
      }
    }

    insert(tokenHash: string): void {
      this.inserts.push(tokenHash);
    }

    commit(): void {
      this.rowSnapshot = { ...this.row };
      this.insertSnapshot = [...this.inserts];
      this.releaseLock();
    }

    rollback(): void {
      this.row = { ...this.rowSnapshot };
      this.inserts = [...this.insertSnapshot];
      this.releaseLock();
    }

    private releaseLock(): void {
      this.holder?.release();
      this.holder = null;
    }
  }

  function queryForStore(store: LockedRefreshStore): RefreshQueryFn {
    return async (sql, params) => {
      if (sql === SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL) {
        const rows = await store.selectForUpdate(params?.[0] as string);
        return { rows };
      }
      if (sql === SELECT_CONTRACTOR_FOR_REFRESH_SQL) {
        return { rows: [contractor] };
      }
      if (sql === REVOKE_REFRESH_TOKEN_SQL) {
        store.revoke(params?.[0] as string);
        return { rows: [] };
      }
      if (sql === INSERT_REFRESH_TOKEN_SQL) {
        store.insert(params?.[1] as string);
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    };
  }

  async function withLockedTx<T>(
    store: LockedRefreshStore,
    fn: (queryFn: RefreshQueryFn) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await fn(queryForStore(store));
      store.commit();
      return result;
    } catch (err) {
      store.rollback();
      throw err;
    }
  }

  it("lets only the lock holder rotate; the waiter then sees the revoked row and gets 401", async () => {
    const store = new LockedRefreshStore({
      id: TOKEN_ID,
      contractor_id: CONTRACTOR_ID,
      token_hash: hashRefreshToken(RAW_REFRESH),
      revoked_at: null,
    });

    const firstHoldsLock = deferred();
    const firstMayContinue = deferred();
    const waiterBlocked = deferred();
    store.onWaiterBlocked = () => waiterBlocked.resolve();

    const first = withLockedTx(store, async (queryFn) => {
      const wrapping: RefreshQueryFn = async (sql, params) => {
        const result = await queryFn(sql, params);
        if (sql === SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL) {
          firstHoldsLock.resolve();
          await firstMayContinue.promise;
        }
        return result;
      };
      return rotateRefreshToken(wrapping, rotateArgs());
    });

    await firstHoldsLock.promise;
    const second = withLockedTx(store, (queryFn) =>
      rotateRefreshToken(queryFn, rotateArgs()),
    );
    await waiterBlocked.promise;
    assert.equal(store.waiters, 1);

    firstMayContinue.resolve();
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

    assert.equal(firstOutcome.status, 200);
    if (firstOutcome.status === 200) {
      assert.equal(firstOutcome.json.refreshToken, NEXT_REFRESH);
    }
    assert.deepEqual(secondOutcome, {
      status: 401,
      json: { error: INVALID_REFRESH_TOKEN_ERROR },
    });
    assert.deepEqual(store.inserts, [hashRefreshToken(NEXT_REFRESH)]);
    assert.ok(store.row.revoked_at);
  });

  it("rolls back the revoke when insert throws, so a waiter can still rotate", async () => {
    const store = new LockedRefreshStore({
      id: TOKEN_ID,
      contractor_id: CONTRACTOR_ID,
      token_hash: hashRefreshToken(RAW_REFRESH),
      revoked_at: null,
    });

    const firstHoldsLock = deferred();
    const firstMayContinue = deferred();
    const waiterBlocked = deferred();
    store.onWaiterBlocked = () => waiterBlocked.resolve();

    const failing = withLockedTx(store, async (queryFn) => {
      const wrapping: RefreshQueryFn = async (sql, params) => {
        if (sql === SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL) {
          const result = await queryFn(sql, params);
          firstHoldsLock.resolve();
          await firstMayContinue.promise;
          return result;
        }
        if (sql === INSERT_REFRESH_TOKEN_SQL) {
          await queryFn(sql, params);
          throw new Error("insert failed");
        }
        return queryFn(sql, params);
      };
      return rotateRefreshToken(wrapping, rotateArgs());
    });

    await firstHoldsLock.promise;
    const waiter = withLockedTx(store, (queryFn) =>
      rotateRefreshToken(queryFn, {
        ...rotateArgs(),
        generateRefreshToken: () => "waiter-refresh-token",
      }),
    );
    await waiterBlocked.promise;
    firstMayContinue.resolve();

    await assert.rejects(() => failing, /insert failed/);
    const waiterOutcome = await waiter;
    assert.equal(waiterOutcome.status, 200);
    if (waiterOutcome.status === 200) {
      assert.equal(waiterOutcome.json.refreshToken, "waiter-refresh-token");
    }
    assert.deepEqual(store.inserts, [hashRefreshToken("waiter-refresh-token")]);
    assert.ok(store.row.revoked_at);
  });
});
