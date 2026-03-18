const express = require("express");
const app = express();

app.use(express.json());

app.post("/webhook", (req, res) => {
    console.log("Señal recibida:");
    console.log(req.body);
    res.send("OK");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("Servidor activo en puerto " + PORT);
});
