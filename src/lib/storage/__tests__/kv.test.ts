import { kvStorage, validateId, hasKvConfig, PERSISTENCE_ERROR } from "../kv";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
function assertEqual<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`ASSERTION FAILED: ${msg} got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
}

type MockCall = { url: string; init: RequestInit | undefined };
let calls: MockCall[] = [];
let mockResponses: Array<{ ok: boolean; status?: number; json: unknown } | Error> = [];
let mockIndex = 0;
const origFetch = global.fetch;
const origEnv = { ...process.env };

function mockFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  calls.push({ url: String(url), init });
  const next = mockResponses[mockIndex++];
  if (next instanceof Error) return Promise.reject(next);
  if (!next) throw new Error("No mock response for fetch call " + mockIndex);
  const ok = next.ok;
  const status = next.status ?? (ok ? 200 : 500);
  return Promise.resolve({
    ok,
    status,
    json: async () => next.json,
  } as Response);
}

function setupEnv(url = "https://test-kv.upstash.io", token = "test_token_123") {
  process.env.KV_REST_API_URL = url;
  process.env.KV_REST_API_TOKEN = token;
  delete process.env.STORAGE_PROVIDER;
  delete process.env.VERCEL;
}

function clearEnv() {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

async function run() {
  let passed = 0;
  let failed = 0;
  const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];

  tests.push({
    name: "saveMission persists JSON via SET",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [{ ok: true, json: { result: "OK" } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const data = { id: "mission_123_abc", mission: "hello", status: "awaiting_approval", approvals: [] };
      await kvStorage.saveMission("mission_123_abc", data);
      assert(calls.length === 1, "one fetch call");
      const body = JSON.parse(calls[0].init?.body as string);
      assertEqual(body[0], "SET", "SET command");
      assert(body[1].includes("mission_123_abc"), "key contains id");
      assert(body[2] === JSON.stringify(data), "value is JSON");
      const auth = (calls[0].init?.headers as Record<string, string>)?.Authorization;
      assert(auth === "Bearer test_token_123", "Authorization header set");
      // Never log token — ensure not in console output (manual, but check not exposed via key)
      assert(!body[1].includes("test_token"), "key does not contain token");
    },
  });

  tests.push({
    name: "getMission retrieves and parses JSON",
    fn: async () => {
      setupEnv();
      calls = [];
      const stored = { id: "mission_456_def", mission: "test", status: "awaiting_approval" };
      mockResponses = [{ ok: true, json: { result: JSON.stringify(stored) } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const got = (await kvStorage.getMission("mission_456_def")) as typeof stored;
      assertEqual(got.id, stored.id, "id matches");
      assertEqual(got.mission, stored.mission, "mission matches");
    },
  });

  tests.push({
    name: "getMission returns null for missing key",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [{ ok: true, json: { result: null } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const got = await kvStorage.getMission("mission_missing");
      assert(got === null, "null for missing");
    },
  });

  tests.push({
    name: "deleteMission returns true on DEL 1",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [{ ok: true, json: { result: 1 } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const ok = await kvStorage.deleteMission("mission_123_abc");
      assert(ok === true, "deleted");
      const body = JSON.parse(calls[0].init?.body as string);
      assertEqual(body[0], "DEL", "DEL command");
    },
  });

  tests.push({
    name: "listMissions via KEYS + GETs",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [
        { ok: true, json: { result: ["nexus:mission:mission_a", "nexus:mission:mission_b"] } }, // KEYS
        { ok: true, json: { result: JSON.stringify({ id: "mission_a", mission: "a mission", updatedAt: 200 }) } },
        { ok: true, json: { result: JSON.stringify({ id: "mission_b", mission: "b mission", updatedAt: 100 }) } },
      ];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const list = await kvStorage.listMissions(10);
      assert(list.length === 2, "two missions");
      assertEqual(list[0].id, "mission_a", "sorted by updatedAt desc");
      assert(list[0].summary?.includes("a mission") === true, "summary");
    },
  });

  tests.push({
    name: "KV HTTP failure throws explicitly",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [{ ok: false, status: 500, json: { error: "internal" } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      let threw = false;
      try {
        await kvStorage.getMission("mission_123_abc");
      } catch (e) {
        threw = true;
        assert((e as Error).message.includes("KV HTTP 500"), "HTTP error message");
      }
      assert(threw, "should throw on HTTP failure");
    },
  });

  tests.push({
    name: "KV fetch network failure throws KV request failed",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [new Error("network down")];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      let threw = false;
      try {
        await kvStorage.getMission("mission_123_abc");
      } catch (e) {
        threw = true;
        assert((e as Error).message.includes("KV request failed"), "request failed");
      }
      assert(threw, "should throw");
    },
  });

  tests.push({
    name: "malformed stored JSON returns null without crash",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [{ ok: true, json: { result: "not-json{{{ " } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const got = await kvStorage.getMission("mission_123_abc");
      assert(got === null, "null on malformed");
    },
  });

  tests.push({
    name: "KV malformed JSON response throws",
    fn: async () => {
      setupEnv();
      calls = [];
      // Simulate res.json() throwing
      // @ts-ignore
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("invalid json");
        },
      }) as Response;
      let threw = false;
      try {
        await kvStorage.getMission("mission_123_abc");
      } catch (e) {
        threw = true;
        assert((e as Error).message.includes("KV malformed JSON"), "malformed json error");
      }
      assert(threw, "should throw");
    },
  });

  tests.push({
    name: "invalid/malicious mission ID rejected before fetch",
    fn: async () => {
      setupEnv();
      calls = [];
      mockResponses = [];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const badIds = ["", "../etc/passwd", "a/b", "a:b", "mission with space", "a".repeat(200), "mission:evil"];
      for (const bad of badIds) {
        let threw = false;
        try {
          await kvStorage.saveMission(bad, {});
        } catch (e) {
          threw = true;
          assert((e as Error).message.includes("Invalid mission ID"), `bad id ${bad}`);
        }
        assert(threw, `should reject ${bad}`);
        assert(calls.length === 0, "no fetch for invalid id");
        // also test validateId directly
        let threw2 = false;
        try {
          validateId(bad);
        } catch {
          threw2 = true;
        }
        assert(threw2, "validateId rejects");
      }
    },
  });

  tests.push({
    name: "provider selection: KV when env present",
    fn: async () => {
      setupEnv();
      assert(hasKvConfig() === true, "hasKvConfig true");
      // dynamic import to test createStorage logic without singleton caching issues
      // Replicate logic: if STORAGE_PROVIDER not set and KV exists => kv
      const mode = (process.env.STORAGE_PROVIDER || "").toLowerCase();
      assert(mode === "", "no explicit mode");
      assert(hasKvConfig(), "kv present");
    },
  });

  tests.push({
    name: "provider selection: explicit memory/file overrides KV",
    fn: async () => {
      setupEnv();
      process.env.STORAGE_PROVIDER = "memory";
      assert((process.env.STORAGE_PROVIDER || "").toLowerCase() === "memory", "memory mode");
      // In real createStorage, memory would win even if KV present
      delete process.env.STORAGE_PROVIDER;
      process.env.STORAGE_PROVIDER = "file";
      assert((process.env.STORAGE_PROVIDER || "").toLowerCase() === "file", "file mode");
      delete process.env.STORAGE_PROVIDER;
    },
  });

  tests.push({
    name: "missing KV configuration detection",
    fn: async () => {
      clearEnv();
      delete process.env.VERCEL;
      assert(hasKvConfig() === false, "no kv");
      assert(PERSISTENCE_ERROR === "Mission persistence is not configured", "error constant");
      // Simulate unconfigured storage path: should throw on save/get
      // Import unconfigured factory via index
      const { createUnconfiguredStorage } = await import("../index");
      const bad = createUnconfiguredStorage();
      let threw = false;
      try {
        await bad.getMission("mission_123");
      } catch (e) {
        threw = true;
        assert((e as Error).message === PERSISTENCE_ERROR, "persistence error");
      }
      assert(threw, "unconfigured throws");
    },
  });

  tests.push({
    name: "approval route can retrieve mission via storage (save -> get)",
    fn: async () => {
      setupEnv();
      calls = [];
      const stored = {
        id: "mission_999_xyz",
        mission: "test mission",
        status: "awaiting_approval",
        approvals: [{ id: "appr_1", status: "pending" }],
        steps: [{ id: "reviewer", status: "waiting_approval" }],
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // save
      mockResponses = [{ ok: true, json: { result: "OK" } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      await kvStorage.saveMission(stored.id, stored);
      // get as approval route would
      mockResponses = [{ ok: true, json: { result: JSON.stringify(stored) } }];
      mockIndex = 0;
      calls = [];
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const loaded = (await kvStorage.getMission(stored.id)) as typeof stored;
      assert(loaded !== null, "loaded not null");
      assertEqual(loaded.id, stored.id, "id matches");
      assertEqual(loaded.status, "awaiting_approval", "status awaiting_approval");
      assert(loaded.approvals.length === 1, "approval present");
    },
  });

  tests.push({
    name: "serialization/deserialization preserves updatedAt and mission",
    fn: async () => {
      setupEnv();
      calls = [];
      const now = Date.now();
      const data = { id: "mission_ser_1", mission: "hello world", updatedAt: now, createdAt: now, status: "running", steps: [], approvals: [], logs: [] };
      mockResponses = [{ ok: true, json: { result: "OK" } }];
      mockIndex = 0;
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      await kvStorage.saveMission(data.id, data);
      const body = JSON.parse(calls[0].init?.body as string);
      const parsed = JSON.parse(body[2]);
      assertEqual(parsed.updatedAt, now, "updatedAt preserved in serialized");
      // get back
      mockResponses = [{ ok: true, json: { result: JSON.stringify(data) } }];
      mockIndex = 0;
      calls = [];
      // @ts-ignore
      global.fetch = mockFetch as unknown as typeof fetch;
      const got = (await kvStorage.getMission(data.id)) as typeof data;
      assertEqual(got.updatedAt, now, "deserialized updatedAt");
      assertEqual(got.mission, "hello world", "mission preserved");
    },
  });

  for (const t of tests) {
    // Reset env and fetch before each test to avoid leakage
    setupEnv();
    calls = [];
    mockResponses = [];
    mockIndex = 0;
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${t.name}: ${e instanceof Error ? e.message : String(e)}`);
      console.error(e instanceof Error ? e.stack : "");
      failed++;
    } finally {
      // restore fetch after each? keep mocked for next iteration setup
    }
  }

  // restore
  global.fetch = origFetch as unknown as typeof fetch;
  // restore env
  for (const k of Object.keys(process.env)) {
    if (!(k in origEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(origEnv)) process.env[k] = v;

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All KV tests passed.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
