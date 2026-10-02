import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assessGoogleProfile,
  emailAllowed,
  isAllowedGoogleRedirect,
  loginErrorMessage,
  passwordMatches,
  readOAuthTransaction,
  sessionStatus,
  signOAuthTransaction,
  signSession,
  type AuthEnv,
} from "../src/lib/team-auth.ts";
import {
  verifyMetaSignature,
  verifySharedToken,
  verifySubscribeHandshake,
} from "../src/lib/webhook-auth.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env: AuthEnv = {
  authSecret: "a".repeat(32),
  teamPassword: "clave-equipo-segura",
  googleClientId: "",
  googleClientSecret: "",
  allowedEmails: [],
  allowedDomains: [],
};

const googleEnv: AuthEnv = {
  authSecret: "a".repeat(32),
  teamPassword: "",
  googleClientId: "client-id.apps.googleusercontent.com",
  googleClientSecret: "google-client-secret-value",
  allowedEmails: ["andres@iac.com"],
  allowedDomains: ["empresa.com"],
};

test("la sesión firmada se acepta y caduca", () => {
  const now = 1_700_000_000_000;
  const token = signSession(env, now);
  assert.equal(sessionStatus(token, env, now + 1000), "ok");
  assert.equal(sessionStatus(token, env, now + 8 * 24 * 60 * 60 * 1000), "unauthenticated");
});

test("una firma alterada o un secreto distinto no pasan", () => {
  const token = signSession(env);
  const [body, sig] = token.split(".");
  assert.equal(sessionStatus(`${body}.${sig.slice(0, -1)}x`, env), "unauthenticated");
  assert.equal(sessionStatus(`${body}x.${sig}`, env), "unauthenticated");
  assert.equal(sessionStatus("no-es-un-token", env), "unauthenticated");
  assert.equal(sessionStatus(undefined, env), "unauthenticated");
  assert.equal(
    sessionStatus(token, { ...env, authSecret: "b".repeat(32) }),
    "unauthenticated"
  );
});

test("rotar la contraseña invalida la sesión", () => {
  const token = signSession(env);
  assert.equal(
    sessionStatus(token, { ...env, teamPassword: "otra-clave-equipo" }),
    "unauthenticated"
  );
});

test("sin secretos suficientes la auth queda cerrada", () => {
  assert.equal(sessionStatus("x", { ...env, authSecret: "short", teamPassword: "short" }), "misconfigured");
  assert.throws(() => signSession({ ...env, authSecret: "short" }));
});

test("Google solo acepta correos o dominios de la lista", () => {
  const now = 1_700_000_000_000;
  const token = signSession(googleEnv, now, { method: "google", email: "Andres@IAC.com" });
  assert.equal(sessionStatus(token, googleEnv, now + 1000), "ok");
  assert.equal(
    sessionStatus(token, { ...googleEnv, allowedEmails: [], allowedDomains: ["otra.com"] }, now + 1000),
    "unauthenticated"
  );

  const domainToken = signSession(googleEnv, now, { method: "google", email: "ana@empresa.com" });
  assert.equal(sessionStatus(domainToken, googleEnv, now + 1000), "ok");
  assert.throws(() => signSession(googleEnv, now, { method: "google", email: "otro@gmail.com" }));
  assert.equal(emailAllowed("otro@gmail.com", { ...googleEnv, allowedEmails: [], allowedDomains: [] }), false);
  assert.equal(sessionStatus(signSession(env, now), googleEnv, now + 1000), "unauthenticated");
  assert.throws(() => signSession(googleEnv, now));

  assert.deepEqual(assessGoogleProfile({ email: "Andres@IAC.com", email_verified: true }, googleEnv), {
    ok: true,
    email: "andres@iac.com",
  });
  assert.equal(assessGoogleProfile({ email: "andres@iac.com", email_verified: false }, googleEnv).ok, false);
  assert.equal(assessGoogleProfile({ email: "andres@iac.com", email_verified: "true" }, googleEnv).ok, true);
  assert.deepEqual(
    assessGoogleProfile({ email: "x@gmail.com", email_verified: true }, googleEnv),
    { ok: false, reason: "not_allowed" }
  );
});

test("el state de Google va firmado y caduca", () => {
  const redirect = "http://localhost:3000/api/auth/google/callback";
  const raw = signOAuthTransaction(googleEnv, "state-123", redirect, 1_000);
  assert.deepEqual(readOAuthTransaction(raw, googleEnv, 1_000), {
    state: "state-123",
    redirectUri: redirect,
  });
  assert.equal(readOAuthTransaction(raw, googleEnv, 1_000 + 11 * 60 * 1000), null);
  assert.equal(
    isAllowedGoogleRedirect("https://agente-ventas-three.vercel.app/api/auth/google/callback"),
    true
  );
  assert.equal(isAllowedGoogleRedirect("http://localhost:3000/api/auth/google/callback"), true);
  assert.equal(isAllowedGoogleRedirect("https://evil.example/api/auth/google/callback?x=1"), false);
  assert.equal(isAllowedGoogleRedirect("http://evil.example/api/auth/google/callback"), false);
});

test("el mensaje de cuenta no autorizada no refleja HTML", () => {
  assert.match(loginErrorMessage("not_allowed", "ana@empresa.com") ?? "", /ana@empresa.com/);
  assert.equal(loginErrorMessage("not_allowed", "<script>")?.includes("script"), false);
  assert.equal(loginErrorMessage("inyectado", "ana@empresa.com"), null);
});

test("la contraseña coincide en tiempo constante y rechaza vacías o enormes", () => {
  assert.equal(passwordMatches(env.teamPassword, env.teamPassword), true);
  assert.equal(passwordMatches("incorrecta-pero-larga", env.teamPassword), false);
  assert.equal(passwordMatches("", env.teamPassword), false);
  assert.equal(passwordMatches("x".repeat(300), env.teamPassword), false);
});

test("HMAC de Meta: firma válida, inválida y ausente", () => {
  const secret = "meta-app-secret-value";
  const body = JSON.stringify({ telefono: "+573001112233", mensaje: "hola" });
  const header =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  assert.equal(verifyMetaSignature(body, header, secret), true);
  assert.equal(verifyMetaSignature(body, header.toUpperCase(), secret), true);
  assert.equal(verifyMetaSignature(body + " ", header, secret), false);
  assert.equal(verifyMetaSignature(body, "sha256=" + "ab".repeat(32), secret), false);
  assert.equal(verifyMetaSignature(body, null, secret), false);
  assert.equal(verifyMetaSignature(body, header, ""), false);
  assert.equal(verifyMetaSignature(body, "sha256=abcd", secret), false);
  assert.equal(verifyMetaSignature(body, header, "otro-secreto-distinto"), false);
});

test("handshake GET de Meta", () => {
  assert.equal(
    verifySubscribeHandshake("subscribe", "token-de-prueba", "123456", "token-de-prueba"),
    "123456"
  );
  assert.equal(
    verifySubscribeHandshake("subscribe", "otro", "123456", "token-de-prueba"),
    null
  );
  assert.equal(
    verifySubscribeHandshake("unsubscribe", "token-de-prueba", "123456", "token-de-prueba"),
    null
  );
  assert.equal(verifySubscribeHandshake("subscribe", "token-de-prueba", "123", ""), null);
  assert.equal(
    verifySubscribeHandshake("subscribe", "token-de-prueba", "bad challenge", "token-de-prueba"),
    null
  );
});

test("token compartido del webhook de Apollo", () => {
  const secret = "c".repeat(32);
  assert.equal(verifySharedToken(secret, secret), true);
  assert.equal(verifySharedToken("no", secret), false);
  assert.equal(verifySharedToken(null, secret), false);
  assert.equal(verifySharedToken(secret, "corto"), false);
});

test("cada route handler de datos exige sesión y los públicos no", () => {
  const allowPublic = new Set([
    "src/app/api/health/route.ts",
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/logout/route.ts",
    "src/app/api/auth/google/route.ts",
    "src/app/api/auth/google/callback/route.ts",
    "src/app/api/whatsapp/webhook/route.ts",
    "src/app/api/apollo/phone-webhook/route.ts",
  ]);

  const apiRoot = path.join(root, "src/app/api");
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") routes.push(path.relative(root, full));
    }
  };
  walk(apiRoot);

  for (const rel of routes) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const handlers = text.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? [];
    if (allowPublic.has(rel)) {
      assert.equal(text.includes("requireTeamApi("), false, `${rel} no debe usar la sesión del equipo`);
      continue;
    }
    const guards = text.match(/requireTeamApi\(/g) ?? [];
    assert.equal(
      guards.length,
      handlers.length,
      `${rel} debe llamar requireTeamApi en cada handler (${handlers.length})`
    );
  }

  const leads = fs.readFileSync(path.join(root, "src/app/api/leads/route.ts"), "utf8");
  assert.match(leads, /confirm !== "true"/);

  const whatsapp = fs.readFileSync(path.join(root, "src/app/api/whatsapp/webhook/route.ts"), "utf8");
  assert.match(whatsapp, /verifyMetaSignature/);
  assert.match(whatsapp, /verifySubscribeHandshake/);
  assert.match(whatsapp, /req\.text\(\)/);
  assert.match(whatsapp, /x-hub-signature-256/);

  const apollo = fs.readFileSync(path.join(root, "src/app/api/apollo/phone-webhook/route.ts"), "utf8");
  assert.match(apollo, /verifySharedToken/);

  const googleStart = fs.readFileSync(path.join(root, "src/app/api/auth/google/route.ts"), "utf8");
  assert.match(googleStart, /googleAuthorizationUrl/);
  const googleOauth = fs.readFileSync(path.join(root, "src/lib/google-oauth.ts"), "utf8");
  assert.match(googleOauth, /accounts\.google\.com/);
  assert.match(googleOauth, /jwtVerify/);
  const googleCallback = fs.readFileSync(
    path.join(root, "src/app/api/auth/google/callback/route.ts"),
    "utf8"
  );
  assert.match(googleCallback, /assessGoogleProfile/);
  const passwordLogin = fs.readFileSync(path.join(root, "src/app/api/auth/login/route.ts"), "utf8");
  assert.match(passwordLogin, /isPasswordEnabled/);

  const layout = fs.readFileSync(path.join(root, "src/app/(app)/layout.tsx"), "utf8");
  assert.match(layout, /currentSessionStatus/);
  const rootLayout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
  assert.equal(rootLayout.includes("AppShell"), false);

  const proxy = fs.readFileSync(path.join(root, "src/proxy.ts"), "utf8");
  assert.match(proxy, /\(\?!api\|/);

  const srcRoot = path.join(root, "src");
  const scan = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        if (text.includes('"use server"') || text.includes("'use server'")) {
          assert.match(text, /requireTeamApi|currentSessionStatus/);
        }
      }
    }
  };
  scan(srcRoot);
});
