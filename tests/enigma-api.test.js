const assert = require("node:assert/strict");
const { test } = require("node:test");

process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.GEMINI_API_KEY = "test-api-key";
process.env.GEMINI_MODEL = "test-model";

const handler = require("../api/enigma.js");
const values = new Map();
const counters = new Map();
let overpassCalls = 0;
let ignCalls = 0;
let geminiCalls = 0;
let noNearbyPlaces = false;

global.fetch = async (url, options = {}) => {
  if (String(url).startsWith(process.env.UPSTASH_REDIS_REST_URL)) {
    const [command, ...args] = JSON.parse(options.body);
    let result;
    if (command === "GET") {
      result = values.get(args[0]) ?? null;
    } else if (command === "SET") {
      const [key, value] = args;
      if (args.includes("NX") && values.has(key)) {
        result = null;
      } else {
        values.set(key, value);
        result = "OK";
      }
    } else if (command === "EVAL" && args[0].includes("INCR")) {
      const key = args[2];
      result = (counters.get(key) ?? 0) + 1;
      counters.set(key, result);
    } else if (command === "EVAL") {
      const [key, token] = args.slice(2);
      if (values.get(key) === token) {
        values.delete(key);
        result = 1;
      } else {
        result = 0;
      }
    } else {
      throw new Error(`Unexpected Redis command: ${command}`);
    }
    return Response.json({ result });
  }

  if (String(url).startsWith("https://data.geopf.fr/geocodage/reverse")) {
    ignCalls += 1;
    const requestUrl = new URL(url);
    assert.equal(requestUrl.searchParams.get("index"), "poi");
    assert.equal(JSON.parse(requestUrl.searchParams.get("searchgeom")).radius, 500);
    return Response.json({
      features: [{
        geometry: { coordinates: [2.1001, 48.1001] },
        properties: {
          toponym: "Bois des tests",
          category: ["bois", "élément topographique ou forestier"],
          distance: 15,
          extrafields: { cleabs: "test-ign-id" },
        },
      }],
    });
  }

  if (String(url).startsWith("https://overpass-api.de")) {
    overpassCalls += 1;
    assert.equal(options.headers["User-Agent"], "Avent/1.0 (+https://github.com/lamailletree/avent)");
    assert.equal(options.headers.Accept, "application/json");
    const query = new URLSearchParams(options.body).get("data");
    assert.match(query, /around:930,48\.1,2\.1/);
    return Response.json({
      elements: noNearbyPlaces
        ? []
        : [{
          type: "node",
          id: 45,
          lat: 48.1001,
          lon: 2.1001,
          tags: { natural: "wood", name: "Bois des tests" },
        }],
    });
  }

  if (String(url).includes("generativelanguage.googleapis.com")) {
    geminiCalls += 1;
    return Response.json({
      candidates: [{ content: { parts: [{ text: "Une énigme créée avec Gemini." }] } }],
    });
  }

  throw new Error(`Unexpected URL: ${url}`);
};

function dateOffset(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function call(body) {
  const result = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
  await handler({
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.10" },
    body,
  }, result);
  return result;
}

test("gates location, generates both modes and shares the first puzzle by date", async () => {
  const firstDate = dateOffset(-2);
  const gated = await call({ calendarDate: firstDate, mode: "openstreetmap" });
  assert.equal(gated.statusCode, 428);
  assert.equal(gated.body.needsLocation, true);
  assert.equal(overpassCalls, 0);

  const generated = await call({
    calendarDate: firstDate,
    mode: "openstreetmap",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 70,
  });
  assert.equal(generated.statusCode, 200);
  assert.equal(generated.body.placeName, "Bois des tests");
  assert.match(generated.body.text, /arbres/);
  assert.equal(generated.body.alreadyShared, false);

  const shared = await call({ calendarDate: firstDate, mode: "gemini" });
  assert.equal(shared.statusCode, 200);
  assert.equal(shared.body.alreadyShared, true);
  assert.equal(shared.body.text, generated.body.text);
  assert.equal(overpassCalls, 1);
  assert.equal(geminiCalls, 0);

  const ai = await call({
    calendarDate: dateOffset(-1),
    mode: "gemini",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 70,
  });
  assert.equal(ai.statusCode, 200);
  assert.equal(ai.body.text, "Une énigme créée avec Gemini.");
  assert.equal(geminiCalls, 1);

  const ignCallsBeforeManualGemini = ignCalls;
  const overpassCallsBeforeManualGemini = overpassCalls;
  const manualAi = await call({
    calendarDate: dateOffset(-6),
    mode: "gemini",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 0,
    locationSource: "manual",
  });
  assert.equal(manualAi.statusCode, 200);
  assert.equal(manualAi.body.text, "Une énigme créée avec Gemini.");
  assert.equal(ignCalls, ignCallsBeforeManualGemini);
  assert.equal(overpassCalls, overpassCallsBeforeManualGemini);
  assert.equal(geminiCalls, 2);

  const savedKey = process.env.GEMINI_API_KEY;
  const savedModel = process.env.GEMINI_MODEL;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  const unavailableGemini = await call({ calendarDate: dateOffset(-4), mode: "gemini" });
  assert.equal(unavailableGemini.statusCode, 503);
  assert.equal(overpassCalls, 2);
  process.env.GEMINI_API_KEY = savedKey;
  process.env.GEMINI_MODEL = savedModel;

  noNearbyPlaces = true;
  const noPlace = await call({
    calendarDate: dateOffset(-3),
    mode: "openstreetmap",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 70,
  });
  assert.equal(noPlace.statusCode, 404);
  noNearbyPlaces = false;

  const overpassCallsBeforeManual = overpassCalls;
  const manual = await call({
    calendarDate: dateOffset(-5),
    mode: "openstreetmap",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 0,
    locationSource: "manual",
  });
  assert.equal(manual.statusCode, 200);
  assert.equal(manual.body.placeSource, "ign");
  assert.equal(manual.body.placeName, "Bois des tests");
  assert.equal(ignCalls, 1);
  assert.equal(overpassCalls, overpassCallsBeforeManual);

  const fifthGeneration = await call({
    calendarDate: dateOffset(-9),
    mode: "openstreetmap",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 70,
  });
  assert.equal(fifthGeneration.statusCode, 200);

  const overpassCallsBeforeLimitedGemini = overpassCalls;
  const ignCallsBeforeLimitedGemini = ignCalls;
  const geminiCallsBeforeLimitedGemini = geminiCalls;
  const limitedGemini = await call({
    calendarDate: dateOffset(-7),
    mode: "gemini",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 70,
  });
  assert.equal(limitedGemini.statusCode, 429);
  assert.equal(overpassCalls, overpassCallsBeforeLimitedGemini);
  assert.equal(ignCalls, ignCallsBeforeLimitedGemini);
  assert.equal(geminiCalls, geminiCallsBeforeLimitedGemini);

  const manualGemini = await call({
    calendarDate: dateOffset(-8),
    mode: "gemini",
    latitude: 48.1,
    longitude: 2.1,
    accuracy: 0,
    locationSource: "manual",
  });
  assert.equal(manualGemini.statusCode, 200);
  assert.equal(manualGemini.body.text, "Une énigme créée avec Gemini.");
  assert.equal(overpassCalls, overpassCallsBeforeLimitedGemini);
  assert.equal(ignCalls, ignCallsBeforeLimitedGemini);
  assert.equal(geminiCalls, geminiCallsBeforeLimitedGemini + 1);

  const future = await call({ calendarDate: dateOffset(3), mode: "openstreetmap" });
  assert.equal(future.statusCode, 400);
});
