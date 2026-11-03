// Servidor sin dependencias (solo Node.js). Puerto 4321 (NO usa 8080 ni 3000).
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");

const PORT = process.env.PORT || 4321;
const RAILWAY_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const PUBLIC_URL = (
  process.env.PUBLIC_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (RAILWAY_DOMAIN ? `https://${RAILWAY_DOMAIN}` : "")
).replace(/\/+$/, "");
const INDEX_FILE = path.join(__dirname, "index.html");
const QR_FILE = path.join(__dirname, "qr.html");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";
const SUPABASE_TABLE_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/rest/v1/asistencias`
  : "";

const CONFERENCIAS = [
  "Ciberseguridad",
  "Peritaje informático",
  "Arquitectura de software y patrones de diseño",
];
const TALLERES = ["Análisis de Big Data", "Cloud Computing"];
const DIAS = ["Miércoles", "Jueves"];

async function solicitarSupabase(ruta, opciones = {}) {
  const respuesta = await fetch(`${SUPABASE_TABLE_URL}${ruta}`, {
    ...opciones,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...opciones.headers,
    },
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(`Supabase respondió ${respuesta.status}: ${texto}`);
  }
  return texto ? JSON.parse(texto) : null;
}

function convertirRegistroSupabase(fila) {
  return {
    id: Number(fila.id),
    nombre: fila.nombre,
    semestre: fila.semestre,
    diaConferencia: fila.dia_conferencia || "",
    diaTaller: fila.dia_taller || "",
    conferencias: fila.conferencias || [],
    talleres: fila.talleres || [],
    fecha: fila.fecha,
  };
}

async function listarAsistencias() {
  const filas = await solicitarSupabase("?select=*&order=id.asc");
  return filas.map(convertirRegistroSupabase);
}

async function crearAsistencia(registro) {
  const filas = await solicitarSupabase("", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      nombre: registro.nombre,
      semestre: registro.semestre,
      dia_conferencia: registro.diaConferencia,
      dia_taller: registro.diaTaller,
      conferencias: registro.conferencias,
      talleres: registro.talleres,
    }),
  });
  return convertirRegistroSupabase(filas[0]);
}

async function eliminarAsistencia(id) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  await solicitarSupabase(`?${query}`, { method: "DELETE" });
}

function responder(res, codigo, cuerpo, tipo = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(codigo, { "Content-Type": tipo, ...extra });
  res.end(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => {
      datos += c;
      if (datos.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(datos || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function csvEscapar(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function responderNoAutorizado(res) {
  return responder(res, 401, { error: "Se requiere iniciar sesión como administrador." }, "application/json; charset=utf-8", {
    "WWW-Authenticate": 'Basic realm="Administración de asistencias", charset="UTF-8"',
    "Cache-Control": "no-store",
  });
}

function administradorAutorizado(req, res) {
  if (!ADMIN_PASSWORD) {
    responder(res, 503, { error: "La administración no está configurada." });
    return false;
  }

  const cabecera = req.headers.authorization || "";
  const coincidencia = cabecera.match(/^Basic\s+(.+)$/i);
  if (!coincidencia) {
    responderNoAutorizado(res);
    return false;
  }

  let credenciales;
  try {
    credenciales = Buffer.from(coincidencia[1], "base64").toString("utf8");
  } catch {
    responderNoAutorizado(res);
    return false;
  }

  const esperadas = Buffer.from(`admin:${ADMIN_PASSWORD}`);
  const recibidas = Buffer.from(credenciales);
  if (recibidas.length !== esperadas.length || !crypto.timingSafeEqual(recibidas, esperadas)) {
    responderNoAutorizado(res);
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/admin") {
    if (!administradorAutorizado(req, res)) return;
    return responder(res, 200, fs.readFileSync(INDEX_FILE, "utf8"), "text/html; charset=utf-8", {
      "Cache-Control": "no-store",
    });
  }

  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    return responder(res, 200, fs.readFileSync(INDEX_FILE, "utf8"), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && (url === "/qr" || url === "/qr.html")) {
    return responder(res, 200, fs.readFileSync(QR_FILE, "utf8"), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url === "/api/health") {
    return responder(res, 200, { ok: true });
  }

  if (req.method === "GET" && url === "/api/opciones") {
    return responder(res, 200, { conferencias: CONFERENCIAS, talleres: TALLERES, dias: DIAS });
  }

  if (req.method === "GET" && url === "/api/config") {
    const mobileUrl = PUBLIC_URL ? `${PUBLIC_URL}/?mobile=1` : "";
    return responder(res, 200, {
      publicUrl: PUBLIC_URL,
      mobileUrl,
      qrReady: Boolean(mobileUrl),
      port: PORT,
    });
  }

  if (req.method === "GET" && url === "/api/qr.svg") {
    const mobileUrl = PUBLIC_URL ? `${PUBLIC_URL}/?mobile=1` : "";
    if (!mobileUrl) {
      return responder(res, 503, "No se detectó una URL pública. Configura PUBLIC_URL para generar el QR.", "text/plain; charset=utf-8");
    }
    const svg = await QRCode.toString(mobileUrl, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      width: 640,
    });
    return responder(res, 200, svg, "image/svg+xml; charset=utf-8", {
      "Cache-Control": "public, max-age=3600",
    });
  }

  if (req.method === "GET" && url === "/api/asistencias") {
    if (!administradorAutorizado(req, res)) return;
    try {
      return responder(res, 200, await listarAsistencias());
    } catch (error) {
      console.error("No se pudieron consultar las asistencias:", error);
      return responder(res, 500, { error: "No se pudieron consultar los registros." });
    }
  }

  if (req.method === "GET" && url === "/api/exportar") {
    if (!administradorAutorizado(req, res)) return;
    const filas = [["Nombre", "Semestre", "Día de la conferencia", "Día del taller", "Conferencias", "Talleres", "Fecha de registro"]];
    try {
      for (const a of await listarAsistencias()) {
        filas.push([
          a.nombre,
          a.semestre,
          a.diaConferencia || a.dia || "",
          a.diaTaller || "",
          a.conferencias.join(" | "),
          a.talleres.join(" | "),
          a.fecha,
        ]);
      }
    } catch (error) {
      console.error("No se pudieron exportar las asistencias:", error);
      return responder(res, 500, { error: "No se pudieron exportar los registros." });
    }
    const csv = "\ufeff" + filas.map((f) => f.map(csvEscapar).join(",")).join("\n");
    return responder(res, 200, csv, "text/csv; charset=utf-8", {
      "Content-Disposition": 'attachment; filename="asistencias.csv"',
    });
  }

  if (req.method === "POST" && url === "/api/asistencias") {
    let b;
    try {
      b = await leerCuerpo(req);
    } catch {
      return responder(res, 400, { error: "Solicitud inválida." });
    }

    try {
      if (!b || typeof b !== "object" || Array.isArray(b)) {
        return responder(res, 400, { error: "Solicitud inválida." });
      }
      const nombre = String(b.nombre || "").trim();
      const semestre = String(b.semestre || "").trim();
      const diaConferencia = String(b.diaConferencia || b.dia || "").trim();
      const diaTaller = String(b.diaTaller || "").trim();
      const conferencias = (Array.isArray(b.conferencias) ? b.conferencias : []).filter((c) => CONFERENCIAS.includes(c));
      const talleres = (Array.isArray(b.talleres) ? b.talleres : []).filter((t) => TALLERES.includes(t));

      if (!nombre || !semestre) {
        return responder(res, 400, { error: "Completa nombre y semestre." });
      }
      if (conferencias.length === 0 && talleres.length === 0) {
        return responder(res, 400, { error: "Selecciona al menos una conferencia o taller." });
      }
      if (conferencias.length > 0 && !DIAS.includes(diaConferencia)) {
        return responder(res, 400, { error: "Selecciona miércoles o jueves para la conferencia." });
      }
      if (talleres.length > 0 && !DIAS.includes(diaTaller)) {
        return responder(res, 400, { error: "Selecciona miércoles o jueves para el taller." });
      }

      const registro = await crearAsistencia({
        id: Date.now(),
        nombre,
        semestre,
        diaConferencia,
        diaTaller,
        conferencias,
        talleres,
        fecha: new Date().toLocaleString("es-MX"),
      });
      return responder(res, 201, registro);
    } catch (error) {
      console.error("No se pudo guardar el registro de asistencia:", error);
      return responder(res, 500, { error: "No se pudo guardar el registro. Inténtalo de nuevo." });
    }
  }

  if (req.method === "DELETE" && url.startsWith("/api/asistencias/")) {
    if (!administradorAutorizado(req, res)) return;
    const id = Number(url.split("/").pop());
    if (!Number.isSafeInteger(id) || id < 1) {
      return responder(res, 400, { error: "Identificador de registro inválido." });
    }
    try {
      await eliminarAsistencia(id);
      return responder(res, 200, { ok: true });
    } catch (error) {
      console.error("No se pudo eliminar la asistencia:", error);
      return responder(res, 500, { error: "No se pudo eliminar el registro." });
    }
  }

  responder(res, 404, { error: "No encontrado" });
});

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "No se puede iniciar: configura SUPABASE_URL y SUPABASE_SECRET_KEY. Esta aplicación solo guarda datos en Supabase."
  );
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`Página de asistencia lista en http://localhost:${PORT}`);
});