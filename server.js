const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// === CONFIG DESDE RENDER ENV VARS ===
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY;
const CAPITAL_EMAIL = process.env.CAPITAL_EMAIL;
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD;
const CAPITAL_BASE_URL =
  process.env.CAPITAL_BASE_URL || "https://demo-api-capital.backend-capital.com";

// IMPORTANTE:
// EPIC = identificador del mercado en Capital.com
// Ejemplos reales dependen del instrumento exacto de tu cuenta/demo.
// Lo pondremos como variable para cambiarlo sin tocar código.
const DEFAULT_EPIC = process.env.CAPITAL_EPIC;
const DEFAULT_CURRENCY = process.env.CAPITAL_CURRENCY || "USD";
const DEFAULT_SIZE = Number(process.env.DEFAULT_SIZE || 1);

// Ruta simple para verificar que el server está vivo
app.get("/", (req, res) => {
  res.send("Bot activo");
});

// Login a Capital.com
async function capitalLogin() {
  const url = `${CAPITAL_BASE_URL}/api/v1/session`;

  const response = await axios.post(
    url,
    {
      identifier: CAPITAL_EMAIL,
      password: CAPITAL_PASSWORD
    },
    {
      headers: {
        "X-CAP-API-KEY": CAPITAL_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  const cst = response.headers["cst"];
  const securityToken = response.headers["x-security-token"];

  if (!cst || !securityToken) {
    throw new Error("No se obtuvieron CST o X-SECURITY-TOKEN");
  }

  return { cst, securityToken };
}

// Crear orden de mercado
async function createMarketOrder({ direction, epic, size }) {
  const { cst, securityToken } = await capitalLogin();

  const url = `${CAPITAL_BASE_URL}/api/v1/positions`;

  const payload = {
    epic: epic,
    direction: direction, // "BUY" o "SELL"
    size: size,
    guaranteedStop: false,
    orderType: "MARKET",
    currencyCode: DEFAULT_CURRENCY,
    forceOpen: true
  };

  const response = await axios.post(url, payload, {
    headers: {
      "X-CAP-API-KEY": CAPITAL_API_KEY,
      "CST": cst,
      "X-SECURITY-TOKEN": securityToken,
      "Content-Type": "application/json"
    }
  });

  return response.data;
}

// Webhook desde TradingView
app.post("/webhook", async (req, res) => {
  try {
    console.log("Señal recibida:");
    console.log(JSON.stringify(req.body));

    const actionRaw = String(req.body.action || "").toLowerCase().trim();
    const symbol = req.body.symbol || DEFAULT_EPIC;
    const size = Number(req.body.size || DEFAULT_SIZE);

    if (!actionRaw) {
      return res.status(400).json({ ok: false, error: "Falta action" });
    }

    let direction;
    if (actionRaw === "buy") {
      direction = "BUY";
    } else if (actionRaw === "sell") {
      direction = "SELL";
    } else {
      return res.status(400).json({ ok: false, error: "action debe ser buy o sell" });
    }

    const result = await createMarketOrder({
      direction,
      epic: symbol,
      size
    });

    console.log("Orden enviada a Capital.com:");
    console.log(JSON.stringify(result));

    return res.json({ ok: true, result });
  } catch (error) {
    console.error("Error en webhook:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data));
    } else {
      console.error(error.message);
    }

    return res.status(500).json({
      ok: false,
      error: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});
