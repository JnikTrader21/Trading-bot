const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY;
const CAPITAL_EMAIL = process.env.CAPITAL_EMAIL;
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD;
const CAPITAL_BASE_URL =
  process.env.CAPITAL_BASE_URL || "https://demo-api-capital.backend-capital.com";

const DEFAULT_EPIC = process.env.CAPITAL_EPIC || "GOLD";
const DEFAULT_CURRENCY = process.env.CAPITAL_CURRENCY || "USD";
const DEFAULT_SIZE = Number(process.env.DEFAULT_SIZE || 1);

app.get("/", (req, res) => {
  res.send("Bot activo");
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  console.log("LOGIN OK");

  if (!cst || !securityToken) {
    throw new Error("No se obtuvieron CST o X-SECURITY-TOKEN");
  }

  return { cst, securityToken };
}

async function getAccountId(cst, securityToken) {
  const url = `${CAPITAL_BASE_URL}/api/v1/accounts`;

  const response = await axios.get(url, {
    headers: {
      "X-CAP-API-KEY": CAPITAL_API_KEY,
      "CST": cst,
      "X-SECURITY-TOKEN": securityToken,
      "Content-Type": "application/json"
    }
  });

  console.log("ACCOUNTS DATA:");
  console.log(JSON.stringify(response.data));

  const accounts = response.data?.accounts || [];
  if (!accounts.length) {
    throw new Error("No se encontraron cuentas en /accounts");
  }

  const preferred =
    accounts.find((a) => String(a.accountType || "").toUpperCase().includes("DEMO")) ||
    accounts[0];

  if (!preferred.accountId) {
    throw new Error("La cuenta encontrada no tiene accountId");
  }

  console.log("ACCOUNT ID USADO:", preferred.accountId);
  return preferred.accountId;
}

async function createMarketOrder({ direction, epic, size }) {
  const { cst, securityToken } = await capitalLogin();
  const accountId = await getAccountId(cst, securityToken);

  const url = `${CAPITAL_BASE_URL}/api/v1/positions`;

  const payload = {
    epic,
    direction,
    size,
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
      "X-ACCOUNT-ID": accountId,
      "Content-Type": "application/json"
    }
  });

  return response.data;
}

app.post("/webhook", async (req, res) => {
  try {
    console.log("Señal recibida:");
    console.log(JSON.stringify(req.body));

    const actionRaw = String(req.body.action || "").toLowerCase().trim();
    const size = Number(req.body.size || DEFAULT_SIZE);
    const epic = DEFAULT_EPIC;

    if (!actionRaw) {
      return res.status(400).json({ ok: false, error: "Falta action" });
    }

    let direction;
    if (actionRaw === "buy") direction = "BUY";
    else if (actionRaw === "sell") direction = "SELL";
    else {
      return res.status(400).json({ ok: false, error: "action debe ser buy o sell" });
    }

    await sleep(1200);

    const result = await createMarketOrder({
      direction,
      epic,
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
