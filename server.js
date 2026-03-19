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

function redact(value) {
  if (!value) return value;
  const str = String(value);
  if (str.length <= 8) return "***";
  return str.slice(0, 4) + "***" + str.slice(-4);
}

async function capitalLogin() {
  const url = `${CAPITAL_BASE_URL}/api/v1/session`;

  console.log("LOGIN REQUEST ->", url);
  console.log("LOGIN EMAIL ->", CAPITAL_EMAIL);
  console.log("LOGIN API KEY ->", redact(CAPITAL_API_KEY));

  try {
    const response = await axios.post(
      url,
      {
        identifier: CAPITAL_EMAIL,
        password: CAPITAL_PASSWORD,
        encryptedPassword: false
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
    console.log("SESSION DATA:", JSON.stringify(response.data));

    if (!cst || !securityToken) {
      throw new Error("No se obtuvieron CST o X-SECURITY-TOKEN");
    }

    return { cst, securityToken, sessionData: response.data };
  } catch (error) {
    console.error("LOGIN FAIL");
    if (error.response) {
      console.error("LOGIN STATUS:", error.response.status);
      console.error("LOGIN DATA:", JSON.stringify(error.response.data));
    } else {
      console.error("LOGIN ERROR:", error.message);
    }
    throw error;
  }
}

async function getAccounts(cst, securityToken) {
  const url = `${CAPITAL_BASE_URL}/api/v1/accounts`;

  console.log("ACCOUNTS REQUEST ->", url);

  try {
    const response = await axios.get(url, {
      headers: {
        "X-CAP-API-KEY": CAPITAL_API_KEY,
        "CST": cst,
        "X-SECURITY-TOKEN": securityToken,
        "Content-Type": "application/json"
      }
    });

    console.log("ACCOUNTS OK");
    console.log("ACCOUNTS DATA:", JSON.stringify(response.data));

    return response.data;
  } catch (error) {
    console.error("ACCOUNTS FAIL");
    if (error.response) {
      console.error("ACCOUNTS STATUS:", error.response.status);
      console.error("ACCOUNTS DATA:", JSON.stringify(error.response.data));
    } else {
      console.error("ACCOUNTS ERROR:", error.message);
    }
    throw error;
  }
}

function pickAccountId(accountsData) {
  const accounts = accountsData?.accounts || [];
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
  const accountsData = await getAccounts(cst, securityToken);
  const accountId = pickAccountId(accountsData);

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

  console.log("ORDER REQUEST ->", url);
  console.log("ORDER PAYLOAD ->", JSON.stringify(payload));

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

app.get("/debug-login", async (req, res) => {
  try {
    const { cst, securityToken, sessionData } = await capitalLogin();
    const accountsData = await getAccounts(cst, securityToken);

    return res.json({
      ok: true,
      sessionData,
      accountsData
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.response?.data || error.message
    });
  }
});

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
    else return res.status(400).json({ ok: false, error: "action debe ser buy o sell" });

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
  console.log("BASE URL:", CAPITAL_BASE_URL);
  console.log("EPIC:", DEFAULT_EPIC);
});
